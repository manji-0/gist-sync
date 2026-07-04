import type { FileLink } from "./file-link";
import type { GistFilename } from "./gist-filename";

export const applyLocalRename = (
  link: FileLink,
  oldLocalName: GistFilename,
  newLocalName: GistFilename
): FileLink => {
  if (link.filename !== oldLocalName) {
    return link;
  }

  return {
    ...link,
    filename: newLocalName,
    pendingRename: { remove: oldLocalName },
  };
};
