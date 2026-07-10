import type { JSONObject } from "../interfaces/global";

export const OBS_REQUEST_NAMES = [
  "GetCanvasList",
  "GetPersistentData",
  "SetPersistentData",
  "GetSceneCollectionList",
  "SetCurrentSceneCollection",
  "CreateSceneCollection",
  "GetProfileList",
  "SetCurrentProfile",
  "CreateProfile",
  "RemoveProfile",
  "GetProfileParameter",
  "SetProfileParameter",
  "GetVideoSettings",
  "SetVideoSettings",
  "GetStreamServiceSettings",
  "SetStreamServiceSettings",
  "GetRecordDirectory",
  "SetRecordDirectory",
  "GetSourceFilterKindList",
  "GetSourceFilterList",
  "GetSourceFilterDefaultSettings",
  "CreateSourceFilter",
  "RemoveSourceFilter",
  "SetSourceFilterName",
  "GetSourceFilter",
  "SetSourceFilterIndex",
  "SetSourceFilterSettings",
  "SetSourceFilterEnabled",
  "GetVersion",
  "GetStats",
  "BroadcastCustomEvent",
  "CallVendorRequest",
  "GetHotkeyList",
  "TriggerHotkeyByName",
  "TriggerHotkeyByKeySequence",
  "Sleep",
  "GetInputList",
  "GetInputKindList",
  "GetSpecialInputs",
  "CreateInput",
  "RemoveInput",
  "SetInputName",
  "GetInputDefaultSettings",
  "GetInputSettings",
  "SetInputSettings",
  "GetInputMute",
  "SetInputMute",
  "ToggleInputMute",
  "GetInputVolume",
  "SetInputVolume",
  "GetInputAudioBalance",
  "SetInputAudioBalance",
  "GetInputAudioSyncOffset",
  "SetInputAudioSyncOffset",
  "GetInputAudioMonitorType",
  "SetInputAudioMonitorType",
  "GetInputAudioTracks",
  "SetInputAudioTracks",
  "GetInputDeinterlaceMode",
  "SetInputDeinterlaceMode",
  "GetInputDeinterlaceFieldOrder",
  "SetInputDeinterlaceFieldOrder",
  "GetInputPropertiesListPropertyItems",
  "PressInputPropertiesButton",
  "GetMediaInputStatus",
  "SetMediaInputCursor",
  "OffsetMediaInputCursor",
  "TriggerMediaInputAction",
  "GetVirtualCamStatus",
  "ToggleVirtualCam",
  "StartVirtualCam",
  "StopVirtualCam",
  "GetReplayBufferStatus",
  "ToggleReplayBuffer",
  "StartReplayBuffer",
  "StopReplayBuffer",
  "SaveReplayBuffer",
  "GetLastReplayBufferReplay",
  "GetOutputList",
  "GetOutputStatus",
  "ToggleOutput",
  "StartOutput",
  "StopOutput",
  "GetOutputSettings",
  "SetOutputSettings",
  "GetRecordStatus",
  "ToggleRecord",
  "StartRecord",
  "StopRecord",
  "ToggleRecordPause",
  "PauseRecord",
  "ResumeRecord",
  "SplitRecordFile",
  "CreateRecordChapter",
  "GetSceneItemList",
  "GetGroupSceneItemList",
  "GetSceneItemId",
  "GetSceneItemSource",
  "CreateSceneItem",
  "RemoveSceneItem",
  "DuplicateSceneItem",
  "GetSceneItemTransform",
  "SetSceneItemTransform",
  "GetSceneItemEnabled",
  "SetSceneItemEnabled",
  "GetSceneItemLocked",
  "SetSceneItemLocked",
  "GetSceneItemIndex",
  "SetSceneItemIndex",
  "GetSceneItemBlendMode",
  "SetSceneItemBlendMode",
  "GetSceneList",
  "GetGroupList",
  "GetCurrentProgramScene",
  "SetCurrentProgramScene",
  "GetCurrentPreviewScene",
  "SetCurrentPreviewScene",
  "CreateScene",
  "RemoveScene",
  "SetSceneName",
  "GetSceneSceneTransitionOverride",
  "SetSceneSceneTransitionOverride",
  "GetSourceActive",
  "GetSourceScreenshot",
  "SaveSourceScreenshot",
  "GetStreamStatus",
  "ToggleStream",
  "StartStream",
  "StopStream",
  "SendStreamCaption",
  "GetTransitionKindList",
  "GetSceneTransitionList",
  "GetCurrentSceneTransition",
  "SetCurrentSceneTransition",
  "SetCurrentSceneTransitionDuration",
  "SetCurrentSceneTransitionSettings",
  "GetCurrentSceneTransitionCursor",
  "TriggerStudioModeTransition",
  "SetTBarPosition",
  "GetStudioModeEnabled",
  "SetStudioModeEnabled",
  "OpenInputPropertiesDialog",
  "OpenInputFiltersDialog",
  "OpenInputInteractDialog",
  "GetMonitorList",
  "OpenVideoMixProjector",
  "OpenSourceProjector",
] as const;

export type OBSRequestType = typeof OBS_REQUEST_NAMES[number];
export type OBSRequestMethodName = Uncapitalize<OBSRequestType>;

export type OBSRequestDataMap = 
{
  "GetCanvasList": undefined;
  "GetPersistentData": {
    realm: string;
    slotName: string;
  };
  "SetPersistentData": {
    realm: string;
    slotName: string;
    slotValue: unknown;
  };
  "GetSceneCollectionList": undefined;
  "SetCurrentSceneCollection": {
    sceneCollectionName: string;
  };
  "CreateSceneCollection": {
    sceneCollectionName: string;
  };
  "GetProfileList": undefined;
  "SetCurrentProfile": {
    profileName: string;
  };
  "CreateProfile": {
    profileName: string;
  };
  "RemoveProfile": {
    profileName: string;
  };
  "GetProfileParameter": {
    parameterCategory: string;
    parameterName: string;
  };
  "SetProfileParameter": {
    parameterCategory: string;
    parameterName: string;
    parameterValue: string;
  };
  "GetVideoSettings": undefined;
  "SetVideoSettings": {
    fpsNumerator?: number;
    fpsDenominator?: number;
    baseWidth?: number;
    baseHeight?: number;
    outputWidth?: number;
    outputHeight?: number;
  };
  "GetStreamServiceSettings": undefined;
  "SetStreamServiceSettings": {
    streamServiceType: string;
    streamServiceSettings: JSONObject;
  };
  "GetRecordDirectory": undefined;
  "SetRecordDirectory": {
    recordDirectory: string;
  };
  "GetSourceFilterKindList": undefined;
  "GetSourceFilterList": {
    canvasUuid?: string;
    sourceName?: string;
    sourceUuid?: string;
  };
  "GetSourceFilterDefaultSettings": {
    filterKind: string;
  };
  "CreateSourceFilter": {
    canvasUuid?: string;
    sourceName?: string;
    sourceUuid?: string;
    filterName: string;
    filterKind: string;
    filterSettings?: JSONObject;
  };
  "RemoveSourceFilter": {
    canvasUuid?: string;
    sourceName?: string;
    sourceUuid?: string;
    filterName: string;
  };
  "SetSourceFilterName": {
    canvasUuid?: string;
    sourceName?: string;
    sourceUuid?: string;
    filterName: string;
    newFilterName: string;
  };
  "GetSourceFilter": {
    canvasUuid?: string;
    sourceName?: string;
    sourceUuid?: string;
    filterName: string;
  };
  "SetSourceFilterIndex": {
    canvasUuid?: string;
    sourceName?: string;
    sourceUuid?: string;
    filterName: string;
    filterIndex: number;
  };
  "SetSourceFilterSettings": {
    canvasUuid?: string;
    sourceName?: string;
    sourceUuid?: string;
    filterName: string;
    filterSettings: JSONObject;
    overlay?: boolean;
  };
  "SetSourceFilterEnabled": {
    canvasUuid?: string;
    sourceName?: string;
    sourceUuid?: string;
    filterName: string;
    filterEnabled: boolean;
  };
  "GetVersion": undefined;
  "GetStats": undefined;
  "BroadcastCustomEvent": {
    eventData: JSONObject;
  };
  "CallVendorRequest": {
    vendorName: string;
    requestType: string;
    requestData?: JSONObject;
  };
  "GetHotkeyList": undefined;
  "TriggerHotkeyByName": {
    hotkeyName: string;
    contextName?: string;
  };
  "TriggerHotkeyByKeySequence": {
    keyId?: string;
    keyModifiers?: JSONObject;
    "keyModifiers.shift"?: boolean;
    "keyModifiers.control"?: boolean;
    "keyModifiers.alt"?: boolean;
    "keyModifiers.command"?: boolean;
  };
  "Sleep": {
    sleepMillis?: number;
    sleepFrames?: number;
  };
  "GetInputList": {
    inputKind?: string;
  };
  "GetInputKindList": {
    unversioned?: boolean;
  };
  "GetSpecialInputs": undefined;
  "CreateInput": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    inputName: string;
    inputKind: string;
    inputSettings?: JSONObject;
    sceneItemEnabled?: boolean;
  };
  "RemoveInput": {
    inputName?: string;
    inputUuid?: string;
  };
  "SetInputName": {
    inputName?: string;
    inputUuid?: string;
    newInputName: string;
  };
  "GetInputDefaultSettings": {
    inputKind: string;
  };
  "GetInputSettings": {
    inputName?: string;
    inputUuid?: string;
  };
  "SetInputSettings": {
    inputName?: string;
    inputUuid?: string;
    inputSettings: JSONObject;
    overlay?: boolean;
  };
  "GetInputMute": {
    inputName?: string;
    inputUuid?: string;
  };
  "SetInputMute": {
    inputName?: string;
    inputUuid?: string;
    inputMuted: boolean;
  };
  "ToggleInputMute": {
    inputName?: string;
    inputUuid?: string;
  };
  "GetInputVolume": {
    inputName?: string;
    inputUuid?: string;
  };
  "SetInputVolume": {
    inputName?: string;
    inputUuid?: string;
    inputVolumeMul?: number;
    inputVolumeDb?: number;
  };
  "GetInputAudioBalance": {
    inputName?: string;
    inputUuid?: string;
  };
  "SetInputAudioBalance": {
    inputName?: string;
    inputUuid?: string;
    inputAudioBalance: number;
  };
  "GetInputAudioSyncOffset": {
    inputName?: string;
    inputUuid?: string;
  };
  "SetInputAudioSyncOffset": {
    inputName?: string;
    inputUuid?: string;
    inputAudioSyncOffset: number;
  };
  "GetInputAudioMonitorType": {
    inputName?: string;
    inputUuid?: string;
  };
  "SetInputAudioMonitorType": {
    inputName?: string;
    inputUuid?: string;
    monitorType: string;
  };
  "GetInputAudioTracks": {
    inputName?: string;
    inputUuid?: string;
  };
  "SetInputAudioTracks": {
    inputName?: string;
    inputUuid?: string;
    inputAudioTracks: JSONObject;
  };
  "GetInputDeinterlaceMode": {
    inputName?: string;
    inputUuid?: string;
  };
  "SetInputDeinterlaceMode": {
    inputName?: string;
    inputUuid?: string;
    inputDeinterlaceMode: string;
  };
  "GetInputDeinterlaceFieldOrder": {
    inputName?: string;
    inputUuid?: string;
  };
  "SetInputDeinterlaceFieldOrder": {
    inputName?: string;
    inputUuid?: string;
    inputDeinterlaceFieldOrder: string;
  };
  "GetInputPropertiesListPropertyItems": {
    inputName?: string;
    inputUuid?: string;
    propertyName: string;
  };
  "PressInputPropertiesButton": {
    inputName?: string;
    inputUuid?: string;
    propertyName: string;
  };
  "GetMediaInputStatus": {
    inputName?: string;
    inputUuid?: string;
  };
  "SetMediaInputCursor": {
    inputName?: string;
    inputUuid?: string;
    mediaCursor: number;
  };
  "OffsetMediaInputCursor": {
    inputName?: string;
    inputUuid?: string;
    mediaCursorOffset: number;
  };
  "TriggerMediaInputAction": {
    inputName?: string;
    inputUuid?: string;
    mediaAction: string;
  };
  "GetVirtualCamStatus": undefined;
  "ToggleVirtualCam": undefined;
  "StartVirtualCam": undefined;
  "StopVirtualCam": undefined;
  "GetReplayBufferStatus": undefined;
  "ToggleReplayBuffer": undefined;
  "StartReplayBuffer": undefined;
  "StopReplayBuffer": undefined;
  "SaveReplayBuffer": undefined;
  "GetLastReplayBufferReplay": undefined;
  "GetOutputList": undefined;
  "GetOutputStatus": {
    outputName: string;
  };
  "ToggleOutput": {
    outputName: string;
  };
  "StartOutput": {
    outputName: string;
  };
  "StopOutput": {
    outputName: string;
  };
  "GetOutputSettings": {
    outputName: string;
  };
  "SetOutputSettings": {
    outputName: string;
    outputSettings: JSONObject;
  };
  "GetRecordStatus": undefined;
  "ToggleRecord": undefined;
  "StartRecord": undefined;
  "StopRecord": undefined;
  "ToggleRecordPause": undefined;
  "PauseRecord": undefined;
  "ResumeRecord": undefined;
  "SplitRecordFile": undefined;
  "CreateRecordChapter": {
    chapterName?: string;
  };
  "GetSceneItemList": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
  };
  "GetGroupSceneItemList": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
  };
  "GetSceneItemId": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sourceName: string;
    searchOffset?: number;
  };
  "GetSceneItemSource": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sceneItemId: number;
  };
  "CreateSceneItem": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sourceName?: string;
    sourceUuid?: string;
    sceneItemEnabled?: boolean;
  };
  "RemoveSceneItem": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sceneItemId: number;
  };
  "DuplicateSceneItem": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sceneItemId: number;
    destinationSceneName?: string;
    destinationSceneUuid?: string;
  };
  "GetSceneItemTransform": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sceneItemId: number;
  };
  "SetSceneItemTransform": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sceneItemId: number;
    sceneItemTransform: JSONObject;
  };
  "GetSceneItemEnabled": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sceneItemId: number;
  };
  "SetSceneItemEnabled": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sceneItemId: number;
    sceneItemEnabled: boolean;
  };
  "GetSceneItemLocked": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sceneItemId: number;
  };
  "SetSceneItemLocked": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sceneItemId: number;
    sceneItemLocked: boolean;
  };
  "GetSceneItemIndex": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sceneItemId: number;
  };
  "SetSceneItemIndex": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sceneItemId: number;
    sceneItemIndex: number;
  };
  "GetSceneItemBlendMode": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sceneItemId: number;
  };
  "SetSceneItemBlendMode": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    sceneItemId: number;
    sceneItemBlendMode: string;
  };
  "GetSceneList": {
    canvasUuid?: string;
  };
  "GetGroupList": undefined;
  "GetCurrentProgramScene": undefined;
  "SetCurrentProgramScene": {
    sceneName?: string;
    sceneUuid?: string;
  };
  "GetCurrentPreviewScene": undefined;
  "SetCurrentPreviewScene": {
    sceneName?: string;
    sceneUuid?: string;
  };
  "CreateScene": {
    canvasUuid?: string;
    sceneName: string;
  };
  "RemoveScene": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
  };
  "SetSceneName": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    newSceneName: string;
  };
  "GetSceneSceneTransitionOverride": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
  };
  "SetSceneSceneTransitionOverride": {
    canvasUuid?: string;
    sceneName?: string;
    sceneUuid?: string;
    transitionName?: string;
    transitionDuration?: number;
  };
  "GetSourceActive": {
    canvasUuid?: string;
    sourceName?: string;
    sourceUuid?: string;
  };
  "GetSourceScreenshot": {
    canvasUuid?: string;
    sourceName?: string;
    sourceUuid?: string;
    imageFormat: string;
    imageWidth?: number;
    imageHeight?: number;
    imageCompressionQuality?: number;
  };
  "SaveSourceScreenshot": {
    canvasUuid?: string;
    sourceName?: string;
    sourceUuid?: string;
    imageFormat: string;
    imageFilePath: string;
    imageWidth?: number;
    imageHeight?: number;
    imageCompressionQuality?: number;
  };
  "GetStreamStatus": undefined;
  "ToggleStream": undefined;
  "StartStream": undefined;
  "StopStream": undefined;
  "SendStreamCaption": {
    captionText: string;
  };
  "GetTransitionKindList": undefined;
  "GetSceneTransitionList": undefined;
  "GetCurrentSceneTransition": undefined;
  "SetCurrentSceneTransition": {
    transitionName: string;
  };
  "SetCurrentSceneTransitionDuration": {
    transitionDuration: number;
  };
  "SetCurrentSceneTransitionSettings": {
    transitionSettings: JSONObject;
    overlay?: boolean;
  };
  "GetCurrentSceneTransitionCursor": undefined;
  "TriggerStudioModeTransition": undefined;
  "SetTBarPosition": {
    position: number;
    release?: boolean;
  };
  "GetStudioModeEnabled": undefined;
  "SetStudioModeEnabled": {
    studioModeEnabled: boolean;
  };
  "OpenInputPropertiesDialog": {
    inputName?: string;
    inputUuid?: string;
  };
  "OpenInputFiltersDialog": {
    inputName?: string;
    inputUuid?: string;
  };
  "OpenInputInteractDialog": {
    inputName?: string;
    inputUuid?: string;
  };
  "GetMonitorList": undefined;
  "OpenVideoMixProjector": {
    videoMixType: string;
    monitorIndex?: number;
    projectorGeometry?: string;
  };
  "OpenSourceProjector": {
    canvasUuid?: string;
    sourceName?: string;
    sourceUuid?: string;
    monitorIndex?: number;
    projectorGeometry?: string;
  };
};

export type OBSRequestResponseMap = 
{
  "GetCanvasList": {
    canvases: JSONObject[];
  };
  "GetPersistentData": {
    slotValue: unknown;
  };
  "SetPersistentData": void;
  "GetSceneCollectionList": {
    currentSceneCollectionName: string;
    sceneCollections: string[];
  };
  "SetCurrentSceneCollection": void;
  "CreateSceneCollection": void;
  "GetProfileList": {
    currentProfileName: string;
    profiles: string[];
  };
  "SetCurrentProfile": void;
  "CreateProfile": void;
  "RemoveProfile": void;
  "GetProfileParameter": {
    parameterValue: string;
    defaultParameterValue: string;
  };
  "SetProfileParameter": void;
  "GetVideoSettings": {
    fpsNumerator: number;
    fpsDenominator: number;
    baseWidth: number;
    baseHeight: number;
    outputWidth: number;
    outputHeight: number;
  };
  "SetVideoSettings": void;
  "GetStreamServiceSettings": {
    streamServiceType: string;
    streamServiceSettings: JSONObject;
  };
  "SetStreamServiceSettings": void;
  "GetRecordDirectory": {
    recordDirectory: string;
  };
  "SetRecordDirectory": void;
  "GetSourceFilterKindList": {
    sourceFilterKinds: string[];
  };
  "GetSourceFilterList": {
    filters: JSONObject[];
  };
  "GetSourceFilterDefaultSettings": {
    defaultFilterSettings: JSONObject;
  };
  "CreateSourceFilter": void;
  "RemoveSourceFilter": void;
  "SetSourceFilterName": void;
  "GetSourceFilter": {
    filterEnabled: boolean;
    filterIndex: number;
    filterKind: string;
    filterSettings: JSONObject;
  };
  "SetSourceFilterIndex": void;
  "SetSourceFilterSettings": void;
  "SetSourceFilterEnabled": void;
  "GetVersion": {
    obsVersion: string;
    obsWebSocketVersion: string;
    rpcVersion: number;
    availableRequests: string[];
    supportedImageFormats: string[];
    platform: string;
    platformDescription: string;
  };
  "GetStats": {
    cpuUsage: number;
    memoryUsage: number;
    availableDiskSpace: number;
    activeFps: number;
    averageFrameRenderTime: number;
    renderSkippedFrames: number;
    renderTotalFrames: number;
    outputSkippedFrames: number;
    outputTotalFrames: number;
    webSocketSessionIncomingMessages: number;
    webSocketSessionOutgoingMessages: number;
  };
  "BroadcastCustomEvent": void;
  "CallVendorRequest": {
    vendorName: string;
    requestType: string;
    responseData: JSONObject;
  };
  "GetHotkeyList": {
    hotkeys: string[];
  };
  "TriggerHotkeyByName": void;
  "TriggerHotkeyByKeySequence": void;
  "Sleep": void;
  "GetInputList": {
    inputs: JSONObject[];
  };
  "GetInputKindList": {
    inputKinds: string[];
  };
  "GetSpecialInputs": {
    desktop1: string;
    desktop2: string;
    mic1: string;
    mic2: string;
    mic3: string;
    mic4: string;
  };
  "CreateInput": {
    inputUuid: string;
    sceneItemId: number;
  };
  "RemoveInput": void;
  "SetInputName": void;
  "GetInputDefaultSettings": {
    defaultInputSettings: JSONObject;
  };
  "GetInputSettings": {
    inputSettings: JSONObject;
    inputKind: string;
  };
  "SetInputSettings": void;
  "GetInputMute": {
    inputMuted: boolean;
  };
  "SetInputMute": void;
  "ToggleInputMute": {
    inputMuted: boolean;
  };
  "GetInputVolume": {
    inputVolumeMul: number;
    inputVolumeDb: number;
  };
  "SetInputVolume": void;
  "GetInputAudioBalance": {
    inputAudioBalance: number;
  };
  "SetInputAudioBalance": void;
  "GetInputAudioSyncOffset": {
    inputAudioSyncOffset: number;
  };
  "SetInputAudioSyncOffset": void;
  "GetInputAudioMonitorType": {
    monitorType: string;
  };
  "SetInputAudioMonitorType": void;
  "GetInputAudioTracks": {
    inputAudioTracks: JSONObject;
  };
  "SetInputAudioTracks": void;
  "GetInputDeinterlaceMode": {
    inputDeinterlaceMode: string;
  };
  "SetInputDeinterlaceMode": void;
  "GetInputDeinterlaceFieldOrder": {
    inputDeinterlaceFieldOrder: string;
  };
  "SetInputDeinterlaceFieldOrder": void;
  "GetInputPropertiesListPropertyItems": {
    propertyItems: JSONObject[];
  };
  "PressInputPropertiesButton": void;
  "GetMediaInputStatus": {
    mediaState: string;
    mediaDuration: number;
    mediaCursor: number;
  };
  "SetMediaInputCursor": void;
  "OffsetMediaInputCursor": void;
  "TriggerMediaInputAction": void;
  "GetVirtualCamStatus": {
    outputActive: boolean;
  };
  "ToggleVirtualCam": {
    outputActive: boolean;
  };
  "StartVirtualCam": void;
  "StopVirtualCam": void;
  "GetReplayBufferStatus": {
    outputActive: boolean;
  };
  "ToggleReplayBuffer": {
    outputActive: boolean;
  };
  "StartReplayBuffer": void;
  "StopReplayBuffer": void;
  "SaveReplayBuffer": void;
  "GetLastReplayBufferReplay": {
    savedReplayPath: string;
  };
  "GetOutputList": {
    outputs: JSONObject[];
  };
  "GetOutputStatus": {
    outputActive: boolean;
    outputReconnecting: boolean;
    outputTimecode: string;
    outputDuration: number;
    outputCongestion: number;
    outputBytes: number;
    outputSkippedFrames: number;
    outputTotalFrames: number;
  };
  "ToggleOutput": {
    outputActive: boolean;
  };
  "StartOutput": void;
  "StopOutput": void;
  "GetOutputSettings": {
    outputSettings: JSONObject;
  };
  "SetOutputSettings": void;
  "GetRecordStatus": {
    outputActive: boolean;
    outputPaused: boolean;
    outputTimecode: string;
    outputDuration: number;
    outputBytes: number;
  };
  "ToggleRecord": {
    outputActive: boolean;
  };
  "StartRecord": void;
  "StopRecord": {
    outputPath: string;
  };
  "ToggleRecordPause": void;
  "PauseRecord": void;
  "ResumeRecord": void;
  "SplitRecordFile": void;
  "CreateRecordChapter": void;
  "GetSceneItemList": {
    sceneItems: JSONObject[];
  };
  "GetGroupSceneItemList": {
    sceneItems: JSONObject[];
  };
  "GetSceneItemId": {
    sceneItemId: number;
  };
  "GetSceneItemSource": {
    sourceName: string;
    sourceUuid: string;
  };
  "CreateSceneItem": {
    sceneItemId: number;
  };
  "RemoveSceneItem": void;
  "DuplicateSceneItem": {
    sceneItemId: number;
  };
  "GetSceneItemTransform": {
    sceneItemTransform: JSONObject;
  };
  "SetSceneItemTransform": void;
  "GetSceneItemEnabled": {
    sceneItemEnabled: boolean;
  };
  "SetSceneItemEnabled": void;
  "GetSceneItemLocked": {
    sceneItemLocked: boolean;
  };
  "SetSceneItemLocked": void;
  "GetSceneItemIndex": {
    sceneItemIndex: number;
  };
  "SetSceneItemIndex": void;
  "GetSceneItemBlendMode": {
    sceneItemBlendMode: string;
  };
  "SetSceneItemBlendMode": void;
  "GetSceneList": {
    currentProgramSceneName: string;
    currentProgramSceneUuid: string;
    currentPreviewSceneName: string;
    currentPreviewSceneUuid: string;
    scenes: {
      sceneIndex: number;
      sceneName: string;
      sceneUuid: string;
    }[];
  };
  "GetGroupList": {
    groups: string[];
  };
  "GetCurrentProgramScene": {
    sceneName: string;
    sceneUuid: string;
    currentProgramSceneName: string;
    currentProgramSceneUuid: string;
  };
  "SetCurrentProgramScene": void;
  "GetCurrentPreviewScene": {
    sceneName: string;
    sceneUuid: string;
    currentPreviewSceneName: string;
    currentPreviewSceneUuid: string;
  };
  "SetCurrentPreviewScene": void;
  "CreateScene": {
    sceneUuid: string;
  };
  "RemoveScene": void;
  "SetSceneName": void;
  "GetSceneSceneTransitionOverride": {
    transitionName: string;
    transitionDuration: number;
  };
  "SetSceneSceneTransitionOverride": void;
  "GetSourceActive": {
    videoActive: boolean;
    videoShowing: boolean;
  };
  "GetSourceScreenshot": {
    imageData: string;
  };
  "SaveSourceScreenshot": void;
  "GetStreamStatus": {
    outputActive: boolean;
    outputReconnecting: boolean;
    outputTimecode: string;
    outputDuration: number;
    outputCongestion: number;
    outputBytes: number;
    outputSkippedFrames: number;
    outputTotalFrames: number;
  };
  "ToggleStream": {
    outputActive: boolean;
  };
  "StartStream": void;
  "StopStream": void;
  "SendStreamCaption": void;
  "GetTransitionKindList": {
    transitionKinds: string[];
  };
  "GetSceneTransitionList": {
    currentSceneTransitionName: string;
    currentSceneTransitionUuid: string;
    currentSceneTransitionKind: string;
    transitions: JSONObject[];
  };
  "GetCurrentSceneTransition": {
    transitionName: string;
    transitionUuid: string;
    transitionKind: string;
    transitionFixed: boolean;
    transitionDuration: number;
    transitionConfigurable: boolean;
    transitionSettings: JSONObject;
  };
  "SetCurrentSceneTransition": void;
  "SetCurrentSceneTransitionDuration": void;
  "SetCurrentSceneTransitionSettings": void;
  "GetCurrentSceneTransitionCursor": {
    transitionCursor: number;
  };
  "TriggerStudioModeTransition": void;
  "SetTBarPosition": void;
  "GetStudioModeEnabled": {
    studioModeEnabled: boolean;
  };
  "SetStudioModeEnabled": void;
  "OpenInputPropertiesDialog": void;
  "OpenInputFiltersDialog": void;
  "OpenInputInteractDialog": void;
  "GetMonitorList": {
    monitors: JSONObject[];
  };
  "OpenVideoMixProjector": void;
  "OpenSourceProjector": void;
};

export type OBSRequestArgumentMode = "none" | "optional" | "required";
export type OBSRequestArgumentModeMap = {
  "GetCanvasList": "none";
  "GetPersistentData": "required";
  "SetPersistentData": "required";
  "GetSceneCollectionList": "none";
  "SetCurrentSceneCollection": "required";
  "CreateSceneCollection": "required";
  "GetProfileList": "none";
  "SetCurrentProfile": "required";
  "CreateProfile": "required";
  "RemoveProfile": "required";
  "GetProfileParameter": "required";
  "SetProfileParameter": "required";
  "GetVideoSettings": "none";
  "SetVideoSettings": "optional";
  "GetStreamServiceSettings": "none";
  "SetStreamServiceSettings": "required";
  "GetRecordDirectory": "none";
  "SetRecordDirectory": "required";
  "GetSourceFilterKindList": "none";
  "GetSourceFilterList": "optional";
  "GetSourceFilterDefaultSettings": "required";
  "CreateSourceFilter": "required";
  "RemoveSourceFilter": "required";
  "SetSourceFilterName": "required";
  "GetSourceFilter": "required";
  "SetSourceFilterIndex": "required";
  "SetSourceFilterSettings": "required";
  "SetSourceFilterEnabled": "required";
  "GetVersion": "none";
  "GetStats": "none";
  "BroadcastCustomEvent": "required";
  "CallVendorRequest": "required";
  "GetHotkeyList": "none";
  "TriggerHotkeyByName": "required";
  "TriggerHotkeyByKeySequence": "optional";
  "Sleep": "optional";
  "GetInputList": "optional";
  "GetInputKindList": "optional";
  "GetSpecialInputs": "none";
  "CreateInput": "required";
  "RemoveInput": "optional";
  "SetInputName": "required";
  "GetInputDefaultSettings": "required";
  "GetInputSettings": "optional";
  "SetInputSettings": "required";
  "GetInputMute": "optional";
  "SetInputMute": "required";
  "ToggleInputMute": "optional";
  "GetInputVolume": "optional";
  "SetInputVolume": "optional";
  "GetInputAudioBalance": "optional";
  "SetInputAudioBalance": "required";
  "GetInputAudioSyncOffset": "optional";
  "SetInputAudioSyncOffset": "required";
  "GetInputAudioMonitorType": "optional";
  "SetInputAudioMonitorType": "required";
  "GetInputAudioTracks": "optional";
  "SetInputAudioTracks": "required";
  "GetInputDeinterlaceMode": "optional";
  "SetInputDeinterlaceMode": "required";
  "GetInputDeinterlaceFieldOrder": "optional";
  "SetInputDeinterlaceFieldOrder": "required";
  "GetInputPropertiesListPropertyItems": "required";
  "PressInputPropertiesButton": "required";
  "GetMediaInputStatus": "optional";
  "SetMediaInputCursor": "required";
  "OffsetMediaInputCursor": "required";
  "TriggerMediaInputAction": "required";
  "GetVirtualCamStatus": "none";
  "ToggleVirtualCam": "none";
  "StartVirtualCam": "none";
  "StopVirtualCam": "none";
  "GetReplayBufferStatus": "none";
  "ToggleReplayBuffer": "none";
  "StartReplayBuffer": "none";
  "StopReplayBuffer": "none";
  "SaveReplayBuffer": "none";
  "GetLastReplayBufferReplay": "none";
  "GetOutputList": "none";
  "GetOutputStatus": "required";
  "ToggleOutput": "required";
  "StartOutput": "required";
  "StopOutput": "required";
  "GetOutputSettings": "required";
  "SetOutputSettings": "required";
  "GetRecordStatus": "none";
  "ToggleRecord": "none";
  "StartRecord": "none";
  "StopRecord": "none";
  "ToggleRecordPause": "none";
  "PauseRecord": "none";
  "ResumeRecord": "none";
  "SplitRecordFile": "none";
  "CreateRecordChapter": "optional";
  "GetSceneItemList": "optional";
  "GetGroupSceneItemList": "optional";
  "GetSceneItemId": "required";
  "GetSceneItemSource": "required";
  "CreateSceneItem": "optional";
  "RemoveSceneItem": "required";
  "DuplicateSceneItem": "required";
  "GetSceneItemTransform": "required";
  "SetSceneItemTransform": "required";
  "GetSceneItemEnabled": "required";
  "SetSceneItemEnabled": "required";
  "GetSceneItemLocked": "required";
  "SetSceneItemLocked": "required";
  "GetSceneItemIndex": "required";
  "SetSceneItemIndex": "required";
  "GetSceneItemBlendMode": "required";
  "SetSceneItemBlendMode": "required";
  "GetSceneList": "optional";
  "GetGroupList": "none";
  "GetCurrentProgramScene": "none";
  "SetCurrentProgramScene": "optional";
  "GetCurrentPreviewScene": "none";
  "SetCurrentPreviewScene": "optional";
  "CreateScene": "required";
  "RemoveScene": "optional";
  "SetSceneName": "required";
  "GetSceneSceneTransitionOverride": "optional";
  "SetSceneSceneTransitionOverride": "optional";
  "GetSourceActive": "optional";
  "GetSourceScreenshot": "required";
  "SaveSourceScreenshot": "required";
  "GetStreamStatus": "none";
  "ToggleStream": "none";
  "StartStream": "none";
  "StopStream": "none";
  "SendStreamCaption": "required";
  "GetTransitionKindList": "none";
  "GetSceneTransitionList": "none";
  "GetCurrentSceneTransition": "none";
  "SetCurrentSceneTransition": "required";
  "SetCurrentSceneTransitionDuration": "required";
  "SetCurrentSceneTransitionSettings": "required";
  "GetCurrentSceneTransitionCursor": "none";
  "TriggerStudioModeTransition": "none";
  "SetTBarPosition": "required";
  "GetStudioModeEnabled": "none";
  "SetStudioModeEnabled": "required";
  "OpenInputPropertiesDialog": "optional";
  "OpenInputFiltersDialog": "optional";
  "OpenInputInteractDialog": "optional";
  "GetMonitorList": "none";
  "OpenVideoMixProjector": "required";
  "OpenSourceProjector": "optional";
};

export type OBSRequestData<T extends OBSRequestType> = OBSRequestDataMap[T];
export type OBSRequestResponse<T extends OBSRequestType> = OBSRequestResponseMap[T];
export type OBSRequestArguments<T extends OBSRequestType> = OBSRequestArgumentModeMap[T] extends "none"
  ? [timeoutMs?: number]
  : OBSRequestArgumentModeMap[T] extends "optional"
    ? [requestData?: OBSRequestDataMap[T], timeoutMs?: number]
    : [requestData: OBSRequestDataMap[T], timeoutMs?: number];
export type OBSRequestFunction<T extends OBSRequestType> = (...args: OBSRequestArguments<T>) => Promise<OBSRequestResponse<T>>;
export type OBSRequestHelpers = { [K in OBSRequestType as Uncapitalize<K>]: OBSRequestFunction<K> };
