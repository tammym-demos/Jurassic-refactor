export interface RAGConfig {
  searchEndpoint: string;
  searchIndexName: string;
  embeddingEndpoint: string;
  embeddingDeployment: string;
}

export function getRAGConfig(): RAGConfig | null {
  const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const embeddingEndpoint = process.env.AZURE_OPENAI_ENDPOINT;

  if (!searchEndpoint || !embeddingEndpoint) {
    return null;
  }

  return {
    searchEndpoint,
    searchIndexName: process.env.AZURE_SEARCH_INDEX_NAME ?? 'jurassic-legacy-docs',
    embeddingEndpoint,
    embeddingDeployment: process.env.AZURE_EMBEDDING_DEPLOYMENT ?? 'text-embedding-ada-002',
  };
}
