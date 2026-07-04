import * as vscode from "vscode";
import * as v from "valibot";
import { schemaResult } from "../../boundary/schema-result";

const GistSyncConfigSchema = v.object({
  authMethod: v.picklist(["auto", "oauth", "pat"]),
  syncOnSave: v.boolean(),
  debounceMs: v.pipe(v.number(), v.minValue(0)),
  gistDescription: v.string(),
  gistPublic: v.boolean(),
});

export type GistSyncConfig = v.InferOutput<typeof GistSyncConfigSchema>;

const defaultConfig = {
  authMethod: "auto",
  syncOnSave: true,
  debounceMs: 500,
  gistDescription: "",
  gistPublic: false,
} as const satisfies GistSyncConfig;

export const readGistSyncConfig = (): GistSyncConfig => {
  const raw = vscode.workspace.getConfiguration("gistSync");
  const result = schemaResult(GistSyncConfigSchema)({
    authMethod: raw.get("authMethod"),
    syncOnSave: raw.get("syncOnSave"),
    debounceMs: raw.get("debounceMs"),
    gistDescription: raw.get("gistDescription"),
    gistPublic: raw.get("gistPublic"),
  });

  return result.match(
    (config) => config,
    () => ({ ...defaultConfig }),
  );
};
