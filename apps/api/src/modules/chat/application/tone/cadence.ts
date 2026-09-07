export function shouldAllowTrailingQuestion(priorAssistantReplies: string[]): boolean {
  const previous = priorAssistantReplies.at(-1);

  if (previous === undefined) {
    return true;
  }

  return !previous.trim().endsWith("?");
}
