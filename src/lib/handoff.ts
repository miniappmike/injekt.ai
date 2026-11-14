/**
 * Pictures carried from one page to the next. The dashboard's drop zone puts them here and opens Inject; the paste
 * router hands them to the first image box on the new page. Kept in memory only, and taken once.
 */
let stash: File[] = [];

export function stashFiles(files: File[]) {
  stash = files;
}

export function takeStashedFiles(): File[] {
  const files = stash;
  stash = [];
  return files;
}
