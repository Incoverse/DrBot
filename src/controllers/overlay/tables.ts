import TableDefinition from "@/lib/base/tableDefinition";

export default class OverlayDefinitions extends TableDefinition {
  
  public static readonly OVERLAYS = `
    DEFINE TABLE OVERWRITE overlays SCHEMALESS;

    DEFINE FIELD OVERWRITE owner ON overlays TYPE record<users>; -- The streamer that owns this overlay
  `.trim();

}

