// Skill interface and registry
// TODO: Implement in Phase C (see issue #23)

export interface Skill {
  readonly name: string;
  execute(context: unknown): Promise<unknown>;
}
