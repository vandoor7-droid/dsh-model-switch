/** Immediate picker feedback around an asynchronous Host model selection. */
export async function beginSelection<T>(
  select: () => Promise<T>,
  showFeedback: () => void,
  settle: (outcome: T) => void,
): Promise<void> {
  showFeedback()
  settle(await select())
}
