type OBSJsonObject = Record<string, unknown>;
type OBSBooleanMap = Record<string, boolean>;

export type OBSInputAudioMonitorType =
  | "OBS_MONITORING_TYPE_NONE"
  | "OBS_MONITORING_TYPE_MONITOR_ONLY"
  | "OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT";

export enum OBSEventSubscription {
  None = 0,
  General = 1 << 0,
  Config = 1 << 1,
  Scenes = 1 << 2,
  Inputs = 1 << 3,
  Transitions = 1 << 4,
  Filters = 1 << 5,
  Outputs = 1 << 6,
  SceneItems = 1 << 7,
  MediaInputs = 1 << 8,
  Vendors = 1 << 9,
  Ui = 1 << 10,
  Canvases = 1 << 11,
  All = General | Config | Scenes | Inputs | Transitions | Filters | Outputs | SceneItems | MediaInputs | Vendors | Ui | Canvases,
  InputVolumeMeters = 1 << 16,
  InputActiveStateChanged = 1 << 17,
  InputShowStateChanged = 1 << 18,
  SceneItemTransformChanged = 1 << 19,
}

export enum OBSRequestBatchExecutionType {
  None = -1,
  SerialRealtime = 0,
  SerialFrame = 1,
  Parallel = 2,
}

export enum OBSRequestStatus {
  Unknown = 0,
  NoError = 10,
  Success = 100,
  MissingRequestType = 203,
  UnknownRequestType = 204,
  GenericError = 205,
  UnsupportedRequestBatchExecutionType = 206,
  NotReady = 207,
  MissingRequestField = 300,
  MissingRequestData = 301,
  InvalidRequestField = 400,
  InvalidRequestFieldType = 401,
  RequestFieldOutOfRange = 402,
  RequestFieldEmpty = 403,
  TooManyRequestFields = 404,
  OutputRunning = 500,
  OutputNotRunning = 501,
  OutputPaused = 502,
  OutputNotPaused = 503,
  OutputDisabled = 504,
  StudioModeActive = 505,
  StudioModeNotActive = 506,
  ResourceNotFound = 600,
  ResourceAlreadyExists = 601,
  InvalidResourceType = 602,
  NotEnoughResources = 603,
  InvalidResourceState = 604,
  InvalidInputKind = 605,
  ResourceNotConfigurable = 606,
  InvalidFilterKind = 607,
  ResourceCreationFailed = 700,
  ResourceActionFailed = 701,
  RequestProcessingFailed = 702,
  CannotAct = 703,
}

export enum OBSOutputState {
  OBS_WEBSOCKET_OUTPUT_UNKNOWN = "OBS_WEBSOCKET_OUTPUT_UNKNOWN",
  OBS_WEBSOCKET_OUTPUT_STARTING = "OBS_WEBSOCKET_OUTPUT_STARTING",
  OBS_WEBSOCKET_OUTPUT_STARTED = "OBS_WEBSOCKET_OUTPUT_STARTED",
  OBS_WEBSOCKET_OUTPUT_STOPPING = "OBS_WEBSOCKET_OUTPUT_STOPPING",
  OBS_WEBSOCKET_OUTPUT_STOPPED = "OBS_WEBSOCKET_OUTPUT_STOPPED",
  OBS_WEBSOCKET_OUTPUT_RECONNECTING = "OBS_WEBSOCKET_OUTPUT_RECONNECTING",
  OBS_WEBSOCKET_OUTPUT_RECONNECTED = "OBS_WEBSOCKET_OUTPUT_RECONNECTED",
  OBS_WEBSOCKET_OUTPUT_PAUSED = "OBS_WEBSOCKET_OUTPUT_PAUSED",
  OBS_WEBSOCKET_OUTPUT_RESUMED = "OBS_WEBSOCKET_OUTPUT_RESUMED",
}

export enum OBSMediaInputAction {
  OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NONE = "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NONE",
  OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY = "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY",
  OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE = "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE",
  OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP = "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP",
  OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART = "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
  OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT = "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT",
  OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS = "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS",
}
export type MessageHELLO = {
  op: 0,
  d: {
    authentication?: {
      challenge: string;
      salt: string;
    },
    obsWebSocketVersion: string;
    obsStudioVersion: string;
    rpcVersion: number;
  }
}

export type MessageIDENTIFY = {
  op: 1,
  d: {
    authentication?: string;
    rpcVersion: number;
    eventSubscriptions?: OBSEventSubscription;
  }
}

export type MessageIDENTIFIED = {
  op: 2,
  d: {
    negotiatedRpcVersion: number;
  }
}

export type MessageEVENT = {
  op: 5,
  d: {
    eventType: OBSEventType;
    eventIntent: OBSEventSubscription;
    eventData: OBSEventData[OBSEventType];
  }
}

export type OBSRequestStatusResponse = {
  code: OBSRequestStatus;
  comment?: string;
};

export type MessageREQUEST = {
  op: 6,
  d: {
    requestId: string;
    requestType: string;
    requestData?: OBSJsonObject;
  }
}

export type MessageREQUEST_RESPONSE = {
  op: 7,
  d: {
    requestId: string;
    requestType: string;
    requestStatus: OBSRequestStatusResponse;
    responseData?: OBSJsonObject;
  }
}

export type MessageREQUEST_BATCH = {
  op: 8,
  d: OBSJsonObject
}

export type MessageREQUEST_BATCH_RESPONSE = {
  op: 9,
  d: OBSJsonObject
}

export type OBSEventData = {
  // ExitStarted.
  "ExitStarted": {};
  // VendorEvent.
  "VendorEvent": {
    // vendorName.
    vendorName: string;
    // eventType.
    eventType: string;
    // eventData.
    eventData: OBSJsonObject; 
  };
  // CustomEvent.
  "CustomEvent": {
    // eventData.
    eventData: OBSJsonObject;
  };

  // CurrentSceneCollectionChanging.
  "CurrentSceneCollectionChanging": {
    // sceneCollectionName.
    sceneCollectionName: string;
  };
  // CurrentSceneCollectionChanged.
  "CurrentSceneCollectionChanged": {
    // sceneCollectionName.
    sceneCollectionName: string;
  };
  // SceneCollectionListChanged.
  "SceneCollectionListChanged": {
    // sceneCollections.
    sceneCollections: string[];
  };
  // CurrentProfileChanging.
  "CurrentProfileChanging": {
    // profileName.
    profileName: string;
  };
  // CurrentProfileChanged.
  "CurrentProfileChanged": {
    // profileName.
    profileName: string;
  };
  // ProfileListChanged.
  "ProfileListChanged": {
    // profiles.
    profiles: string[];
  };
  // CanvasCreated.
  "CanvasCreated": {
    // canvasName.
    canvasName: string;
    // canvasUuid.
    canvasUuid: string;
  };
  // CanvasRemoved.
  "CanvasRemoved": {
    // canvasName.
    canvasName: string;
    // canvasUuid.
    canvasUuid: string;
  };
  // CanvasNameChanged.
  "CanvasNameChanged": {
    // oldCanvasName.
    oldCanvasName: string;
    // canvasName.
    canvasName: string;
    // canvasUuid.
    canvasUuid: string;
  };

  // SceneCreated.
  "SceneCreated": {
    // sceneName.
    sceneName: string;
    // sceneUuid.
    sceneUuid: string;
    // isGroup.
    isGroup: boolean;
  };
  // SceneRemoved.
  "SceneRemoved": {
    // sceneName.
    sceneName: string;
    // sceneUuid.
    sceneUuid: string;
    // isGroup.
    isGroup: boolean;
  };

  // SceneNameChanged.
  "SceneNameChanged": {
    // sceneName.
    sceneName: string;
    // sceneUuid.
    sceneUuid: string;
    // oldSceneName.
    oldSceneName: string;
  }
  // CurrentProgramSceneChanged.
  "CurrentProgramSceneChanged": {
    // sceneName.
    sceneName: string;
    // sceneUuid.
    sceneUuid: string;
  };
  // CurrentPreviewSceneChanged.
  "CurrentPreviewSceneChanged": {
    // sceneName.
    sceneName: string;
    // sceneUuid.
    sceneUuid: string;
  };
  // SceneListChanged.
  "SceneListChanged": {
    // scenes.
    scenes: {
      // sceneName.
      sceneName: string;
      // sceneUuid.
      sceneUuid: string;
      // isGroup.
      isGroup: boolean;
    }[];
  };
  // InputCreated.
  "InputCreated": {
    // inputName.
    inputName: string;
    // inputKind.
    inputKind: string;
    // inputUuid.
    inputUuid: string;
    // unversionedInputKind.
    unversionedInputKind: string;
    // inputKindCaps.
    inputKindCaps: number;
    // inputSettings.
    inputSettings: OBSJsonObject;
    // defaultInputSettings.
    defaultInputSettings: OBSJsonObject;
  };
  // InputRemoved.
  "InputRemoved": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
  };
  // InputNameChanged.
  "InputNameChanged": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
    // oldInputName.
    oldInputName: string;
  };
  // InputSettingsChanged.
  "InputSettingsChanged": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
    // inputSettings.
    inputSettings: OBSJsonObject;
  };
  // InputActiveStateChanged.
  "InputActiveStateChanged": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
    // videoActive.
    videoActive: boolean;
  };
  // InputShowStateChanged.
  "InputShowStateChanged": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
    // videoShowing.
    videoShowing: boolean;
  }
  // InputMuteStateChanged.
  "InputMuteStateChanged": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
    // inputMuted.
    inputMuted: boolean;
  }
  // InputVolumeChanged.
  "InputVolumeChanged": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
    // inputVolumeDb.
    inputVolumeDb: number;
    // inputVolumeMul.
    inputVolumeMul: number;
  };
  // InputAudioBalanceChanged.
  "InputAudioBalanceChanged": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
    // inputAudioBalance.
    inputAudioBalance: number;
  };
  // InputAudioSyncOffsetChanged.
  "InputAudioSyncOffsetChanged": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
    // inputAudioSyncOffset.
    inputAudioSyncOffset: number;
  };
  // InputAudioTracksChanged.
  "InputAudioTracksChanged": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
    // inputAudioTracks.
    inputAudioTracks: OBSBooleanMap;
  };
  // InputAudioMonitorTypeChanged.
  "InputAudioMonitorTypeChanged": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
    // monitorType.
    monitorType: OBSInputAudioMonitorType;
  };
  // InputVolumeMeters.
  "InputVolumeMeters": {
    // inputs.
    inputs: {
      // inputName.
      inputName: string;
      // inputUuid.
      inputUuid: string;
    }[];
  };
  // CurrentSceneTransitionChanged.
  "CurrentSceneTransitionChanged": {
    // transitionName.
    transitionName: string;
    // transitionUuid.
    transitionUuid: string;
  };
  // CurrentSceneTransitionDurationChanged.
  "CurrentSceneTransitionDurationChanged": {
    // transitionDuration.
    transitionDuration: number;
  };
  // SceneTransitionStarted.
  "SceneTransitionStarted": {
    // transitionName.
    transitionName: string;
    // transitionUuid.
    transitionUuid: string;
  };
  // SceneTransitionEnded.
  "SceneTransitionEnded": {
    // transitionName.
    transitionName: string;
    // transitionUuid.
    transitionUuid: string;
  };
  // SceneTransitionVideoEnded.
  "SceneTransitionVideoEnded": {
    // transitionName.
    transitionName: string;
    // transitionUuid.
    transitionUuid: string;
  };

  // SourceFilterListReindexed.
  "SourceFilterListReindexed": {
    // sourceName.
    sourceName: string;
    // filters.
    filters: {
      // filterName.
      filterName: string;
      // filterUuid.
      filterUuid: string;
    }[];
  };
  // SourceFilterCreated.
  "SourceFilterCreated": {
    // sourceName.
    sourceName: string;
    // filterName.
    filterName: string;
    // filterKind.
    filterKind: string;
    // filterIndex.
    filterIndex: number;
    // filterSettings.
    filterSettings: OBSJsonObject;
    // defaultFilterSettings.
    defaultFilterSettings: OBSJsonObject;
  };
  // SourceFilterRemoved.
  "SourceFilterRemoved": {
    // sourceName.
    sourceName: string;
    // filterName.
    filterName: string;
  };
  // SourceFilterNameChanged.
  "SourceFilterNameChanged": {
    // sourceName.
    sourceName: string;
    // filterName.
    filterName: string;
    // oldFilterName.
    oldFilterName: string;
  };
  // SourceFilterSettingsChanged.
  "SourceFilterSettingsChanged": {
    // sourceName.
    sourceName: string;
    // filterName.
    filterName: string;
    // filterSettings.
    filterSettings: OBSJsonObject;
  };
  // SourceFilterEnableStateChanged.
  "SourceFilterEnableStateChanged": {
    // sourceName.
    sourceName: string;
    // filterName.
    filterName: string;
    // filterEnabled.
    filterEnabled: boolean;
  };
  // SceneItemCreated.
  "SceneItemCreated": {
    // sceneName.
    sceneName: string;
    // sceneUuid.
    sceneUuid: string;
    // sourceName.
    sourceName: string;
    // sourceUuid.
    sourceUuid: string;
    // sceneItemId.
    sceneItemId: number;
    // sceneItemIndex.
    sceneItemIndex: number;
  };
  // SceneItemRemoved.
  "SceneItemRemoved": {
    // sceneName.
    sceneName: string;
    // sceneUuid.
    sceneUuid: string;
    // sourceName.
    sourceName: string;
    // sourceUuid.
    sourceUuid: string;
    // sceneItemId.
    sceneItemId: number;
  };
  // SceneItemListReindexed.
  "SceneItemListReindexed": {
    // sceneName.
    sceneName: string;
    // sceneUuid.
    sceneUuid: string;
    // sceneItems.
    sceneItems: {
      // sourceName.
      sourceName: string;
      // sourceUuid.
      sourceUuid: string;
      // sceneItemId.
      sceneItemId: number;
      // sceneItemIndex.
      sceneItemIndex: number;
    }[];
  };
  // SceneItemEnableStateChanged.
  "SceneItemEnableStateChanged": {
    // sceneName.
    sceneName: string;
    // sceneUuid.
    sceneUuid: string;
    // sceneItemId.
    sceneItemId: number;
    // sceneItemEnabled.
    sceneItemEnabled: boolean;
  };
  // SceneItemLockStateChanged.
  "SceneItemLockStateChanged": {
    // sceneName.
    sceneName: string;
    // sceneUuid.
    sceneUuid: string;
    // sceneItemId.
    sceneItemId: number;
    // sceneItemLocked.
    sceneItemLocked: boolean;
  };
  // SceneItemSelected.
  "SceneItemSelected": {
    // sceneName.
    sceneName: string;
    // sceneUuid.
    sceneUuid: string;
    // sceneItemId.
    sceneItemId: number;
  };
  // SceneItemTransformChanged.
  "SceneItemTransformChanged": {
    // sceneName.
    sceneName: string;
    // sceneUuid.
    sceneUuid: string;
    // sceneItemId.
    sceneItemId: number;
    // sceneItemTransform.
    sceneItemTransform: OBSJsonObject;
  };
  // StreamStateChanged.
  "StreamStateChanged": {
    // outputActive.
    outputActive: boolean;
    // outputState.
    outputState: OBSOutputState;
  };
  // RecordStateChanged.
  "RecordStateChanged": {
    // outputActive.
    outputActive: boolean;
    // outputState.
    outputState: OBSOutputState;
    // outputPath.
    outputPath: string | null;
  };
  // RecordFileChanged.
  "RecordFileChanged": {
    // newOutputPath.
    newOutputPath: string;
  };
  // ReplayBufferStateChanged.
  "ReplayBufferStateChanged": {
    // outputActive.
    outputActive: boolean;
    // outputState.
    outputState: OBSOutputState;
  };
  // VirtualcamStateChanged.
  "VirtualcamStateChanged": {
    // outputActive.
    outputActive: boolean;
    // outputState.
    outputState: OBSOutputState;
  };
  // ReplayBufferSaved.
  "ReplayBufferSaved": {
    // savedReplayPath.
    savedReplayPath: string;
  };
  // MediaInputPlaybackStarted.
  "MediaInputPlaybackStarted": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
  };
  // MediaInputPlaybackEnded.
  "MediaInputPlaybackEnded": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
  };
  // MediaInputActionTriggered.
  "MediaInputActionTriggered": {
    // inputName.
    inputName: string;
    // inputUuid.
    inputUuid: string;
    // mediaAction.
    mediaAction: OBSMediaInputAction;
  };

  // StudioModeStateChanged.
  "StudioModeStateChanged": {
    // studioModeEnabled.
    studioModeEnabled: boolean;
  };
  // ScreenshotSaved.
  "ScreenshotSaved": {
    // savedScreenshotPath.
    savedScreenshotPath: string;
  };
}

export type OBSMessage = 
  | MessageHELLO
  | MessageIDENTIFY
  | MessageIDENTIFIED
  | MessageREQUEST
  | MessageREQUEST_RESPONSE
  | MessageREQUEST_BATCH
  | MessageREQUEST_BATCH_RESPONSE
  | MessageEVENT

export enum OBSOpCode {
  HELLO = 0,
  IDENTIFY = 1,
  IDENTIFIED = 2,
  REIDENTIFY = 3,
  EVENT = 5,
  REQUEST = 6,
  REQUEST_RESPONSE = 7,
  REQUEST_BATCH = 8,
  REQUEST_BATCH_RESPONSE = 9,
}

export type OBSEventType = keyof OBSEventData;