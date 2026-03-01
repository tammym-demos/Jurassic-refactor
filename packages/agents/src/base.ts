// Agent base class - common SDK initialization, context isolation, artifact I/O
// TODO: Implement in Phase C (see issue #18)

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly mode: "read-only" | "read-write";
}
