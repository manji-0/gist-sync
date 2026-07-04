import * as vscode from "vscode";
import { z } from "zod";
import { schemaResult } from "../../boundary/schema-result";

const GistSyncConfigSchema = z.object({
  authMethod: z.enum(["auto", "oauth", "pat"]),
  syncOnSave: z.boolean(),
  debounceMs: z.number().min(0),
  gistDescription: z.string(),
  gistPublic: z.boolean(),
});

export type GistSyncConfig = z.infer<typeof GistSyncConfigSchema>;

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
    () => ({ ...defaultConfig })
  );
};
