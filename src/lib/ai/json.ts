/** Pulls the first JSON object out of a model reply, tolerating code fences and chatter around it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The model did not return the expected result. Try again.");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("The model returned a result that could not be read. Try again.");
  }
}

/** Runs a task that answers in JSON, asking once more for valid JSON when the first reply can't be read. */
export async function askJson(client: { run(task: { prompt: string; images?: string[] }): Promise<string> }, task: { prompt: string; images?: string[] }): Promise<unknown> {
  try {
    return extractJson(await client.run(task));
  } catch (e) {
    if (!(e instanceof Error) || !/could not be read|expected result/.test(e.message)) throw e;
    return extractJson(await client.run({ ...task, prompt: `${task.prompt}\nReturn only valid JSON.` }));
  }
}
