import { GistMapping } from "./types";

/**
 * When a local .md file is renamed, update the gist mapping when the gist
 * file key tracked the old local basename.
 */
export function mappingAfterLocalRename(
  mapping: GistMapping,
  oldLocalName: string,
  newLocalName: string
): GistMapping {
  if (mapping.filename !== oldLocalName) {
    return mapping;
  }
  return {
    ...mapping,
    filename: newLocalName,
    replacesFilename: oldLocalName,
    overwrite: mapping.overwrite,
  };
}
