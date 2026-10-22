import { randomUUID } from "node:crypto";

// All media paths start with the owner's id so storage RLS can match on the first folder.
export const rawPath = (userId: string) => `${userId}/raw/${randomUUID()}`;
export const finalPath = (userId: string, folder: string) => `${userId}/${folder}/${randomUUID()}.jpg`;
export const isOwnRawPath = (userId: string, path: string) =>
  path.startsWith(`${userId}/raw/`) && !path.includes("..") && path.split("/").length === 3;
export const isOwnPath = (userId: string, path: string) =>
  path.startsWith(`${userId}/`) && !path.includes("..");
