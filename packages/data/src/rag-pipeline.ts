import { DefaultAzureCredential } from '@azure/identity';
import { SearchClient } from '@azure/search-documents';
import { type RAGConfig, getRAGConfig } from './rag-config.js';

export interface DocumentChunk {
  id: string;
  content: string;
  filePath: string;
  chunkIndex: number;
  metadata: Record<string, string>;
}

export interface RetrievalResult {
  chunks: Array<{ content: string; filePath: string; score: number }>;
  query: string;
}

export class RAGPipelineService {
  private config: RAGConfig | null;
  private credential: DefaultAzureCredential;
  private searchClient: SearchClient<DocumentChunk> | undefined;

  constructor() {
    this.config = getRAGConfig();
    this.credential = new DefaultAzureCredential();

    if (this.config) {
      this.searchClient = new SearchClient<DocumentChunk>(
        this.config.searchEndpoint,
        this.config.searchIndexName,
        this.credential,
      );
    }
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  chunkDocument(filePath: string, content: string, chunkSize = 1000): DocumentChunk[] {
    const overlap = 200;
    const chunks: DocumentChunk[] = [];
    let start = 0;
    let chunkIndex = 0;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      chunks.push({
        id: `${filePath.replace(/[^a-zA-Z0-9]/g, '_')}_${chunkIndex}`,
        content: content.slice(start, end),
        filePath,
        chunkIndex,
        metadata: {},
      });
      chunkIndex++;
      start += chunkSize - overlap;
    }

    return chunks;
  }

  chunkCodeFiles(files: Array<{ path: string; content: string }>): DocumentChunk[] {
    const allChunks: DocumentChunk[] = [];

    for (const file of files) {
      const sections = file.content.split(/\n(?=(?:export |class |function |interface |type |const |def |public ))/);

      if (sections.length <= 1) {
        allChunks.push(...this.chunkDocument(file.path, file.content));
        continue;
      }

      let chunkIndex = 0;
      for (const section of sections) {
        const trimmed = section.trim();
        if (!trimmed) continue;

        if (trimmed.length > 1000) {
          const subChunks = this.chunkDocument(file.path, trimmed);
          for (const sc of subChunks) {
            sc.id = `${file.path.replace(/[^a-zA-Z0-9]/g, '_')}_code_${chunkIndex}`;
            sc.chunkIndex = chunkIndex;
            chunkIndex++;
          }
          allChunks.push(...subChunks);
        } else {
          allChunks.push({
            id: `${file.path.replace(/[^a-zA-Z0-9]/g, '_')}_code_${chunkIndex}`,
            content: trimmed,
            filePath: file.path,
            chunkIndex,
            metadata: {},
          });
          chunkIndex++;
        }
      }
    }

    return allChunks;
  }

  async indexChunks(chunks: DocumentChunk[]): Promise<{ indexed: number; failed: number }> {
    if (!this.searchClient || !this.config) {
      console.warn('RAG pipeline not configured — skipping indexing.');
      return { indexed: 0, failed: 0 };
    }

    try {
      const result = await this.searchClient.uploadDocuments(chunks);
      let failed = 0;
      for (const r of result.results) {
        if (!r.succeeded) failed++;
      }
      return { indexed: chunks.length - failed, failed };
    } catch (err) {
      console.warn('RAG indexing failed:', err);
      return { indexed: 0, failed: chunks.length };
    }
  }

  async retrieve(query: string, topK = 5): Promise<RetrievalResult> {
    if (!this.searchClient || !this.config) {
      console.warn('RAG pipeline not configured — returning empty results.');
      return { chunks: [], query };
    }

    try {
      const results = await this.searchClient.search(query, {
        top: topK,
      });

      const chunks: RetrievalResult['chunks'] = [];
      for await (const result of results.results) {
        chunks.push({
          content: result.document.content,
          filePath: result.document.filePath,
          score: result.score ?? 0,
        });
      }
      return { chunks, query };
    } catch (err) {
      console.warn('RAG retrieval failed:', err);
      return { chunks: [], query };
    }
  }
}
