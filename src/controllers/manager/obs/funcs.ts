import type { OBSRequestArguments, OBSRequestDataMap, OBSRequestHelpers, OBSRequestResponse, OBSRequestType } from "./request-types";

export interface OBSRequestContext {
  request<TRequestType extends OBSRequestType>(requestType: TRequestType, ...args: OBSRequestArguments<TRequestType>): Promise<OBSRequestResponse<TRequestType>>;
}

/** Gets an array of canvases in OBS. */
export async function getCanvasList(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetCanvasList">> {
  return this.request("GetCanvasList", timeoutMs);
}

/** Gets the value of a "slot" from the selected persistent data realm. */
export async function getPersistentData(this: OBSRequestContext, requestData: OBSRequestDataMap["GetPersistentData"], timeoutMs?: number): Promise<OBSRequestResponse<"GetPersistentData">> {
  return this.request("GetPersistentData", requestData, timeoutMs);
}

/** Sets the value of a "slot" from the selected persistent data realm. */
export async function setPersistentData(this: OBSRequestContext, requestData: OBSRequestDataMap["SetPersistentData"], timeoutMs?: number): Promise<OBSRequestResponse<"SetPersistentData">> {
  return this.request("SetPersistentData", requestData, timeoutMs);
}

/** Gets an array of all scene collections */
export async function getSceneCollectionList(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetSceneCollectionList">> {
  return this.request("GetSceneCollectionList", timeoutMs);
}

/** Switches to a scene collection. Note: This will block until the collection has finished changing. */
export async function setCurrentSceneCollection(this: OBSRequestContext, requestData: OBSRequestDataMap["SetCurrentSceneCollection"], timeoutMs?: number): Promise<OBSRequestResponse<"SetCurrentSceneCollection">> {
  return this.request("SetCurrentSceneCollection", requestData, timeoutMs);
}

/** Creates a new scene collection, switching to it in the process. Note: This will block until the collection has finished changing. */
export async function createSceneCollection(this: OBSRequestContext, requestData: OBSRequestDataMap["CreateSceneCollection"], timeoutMs?: number): Promise<OBSRequestResponse<"CreateSceneCollection">> {
  return this.request("CreateSceneCollection", requestData, timeoutMs);
}

/** Gets an array of all profiles */
export async function getProfileList(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetProfileList">> {
  return this.request("GetProfileList", timeoutMs);
}

/** Switches to a profile. */
export async function setCurrentProfile(this: OBSRequestContext, requestData: OBSRequestDataMap["SetCurrentProfile"], timeoutMs?: number): Promise<OBSRequestResponse<"SetCurrentProfile">> {
  return this.request("SetCurrentProfile", requestData, timeoutMs);
}

/** Creates a new profile, switching to it in the process */
export async function createProfile(this: OBSRequestContext, requestData: OBSRequestDataMap["CreateProfile"], timeoutMs?: number): Promise<OBSRequestResponse<"CreateProfile">> {
  return this.request("CreateProfile", requestData, timeoutMs);
}

/** Removes a profile. If the current profile is chosen, it will change to a different profile first. */
export async function removeProfile(this: OBSRequestContext, requestData: OBSRequestDataMap["RemoveProfile"], timeoutMs?: number): Promise<OBSRequestResponse<"RemoveProfile">> {
  return this.request("RemoveProfile", requestData, timeoutMs);
}

/** Gets a parameter from the current profile's configuration. */
export async function getProfileParameter(this: OBSRequestContext, requestData: OBSRequestDataMap["GetProfileParameter"], timeoutMs?: number): Promise<OBSRequestResponse<"GetProfileParameter">> {
  return this.request("GetProfileParameter", requestData, timeoutMs);
}

/** Sets the value of a parameter in the current profile's configuration. */
export async function setProfileParameter(this: OBSRequestContext, requestData: OBSRequestDataMap["SetProfileParameter"], timeoutMs?: number): Promise<OBSRequestResponse<"SetProfileParameter">> {
  return this.request("SetProfileParameter", requestData, timeoutMs);
}

/** Gets the current video settings. Note: To get the true FPS value, divide the FPS numerator by the FPS denominator. Example: `60000/1001` */
export async function getVideoSettings(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetVideoSettings">> {
  return this.request("GetVideoSettings", timeoutMs);
}

/** Sets the current video settings. Note: Fields must be specified in pairs. For example, you cannot set only `baseWidth` without needing to specify `baseHeight`. */
export async function setVideoSettings(this: OBSRequestContext, requestData?: OBSRequestDataMap["SetVideoSettings"], timeoutMs?: number): Promise<OBSRequestResponse<"SetVideoSettings">> {
  return this.request("SetVideoSettings", requestData, timeoutMs);
}

/** Gets the current stream service settings (stream destination). */
export async function getStreamServiceSettings(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetStreamServiceSettings">> {
  return this.request("GetStreamServiceSettings", timeoutMs);
}

/** Sets the current stream service settings (stream destination). Note: Simple RTMP settings can be set with type `rtmp_custom` and the settings fields `server` and `key`. */
export async function setStreamServiceSettings(this: OBSRequestContext, requestData: OBSRequestDataMap["SetStreamServiceSettings"], timeoutMs?: number): Promise<OBSRequestResponse<"SetStreamServiceSettings">> {
  return this.request("SetStreamServiceSettings", requestData, timeoutMs);
}

/** Gets the current directory that the record output is set to. */
export async function getRecordDirectory(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetRecordDirectory">> {
  return this.request("GetRecordDirectory", timeoutMs);
}

/** Sets the current directory that the record output writes files to. */
export async function setRecordDirectory(this: OBSRequestContext, requestData: OBSRequestDataMap["SetRecordDirectory"], timeoutMs?: number): Promise<OBSRequestResponse<"SetRecordDirectory">> {
  return this.request("SetRecordDirectory", requestData, timeoutMs);
}

/** Gets an array of all available source filter kinds. Similar to `GetInputKindList` */
export async function getSourceFilterKindList(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetSourceFilterKindList">> {
  return this.request("GetSourceFilterKindList", timeoutMs);
}

/** Gets an array of all of a source's filters. */
export async function getSourceFilterList(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetSourceFilterList"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSourceFilterList">> {
  return this.request("GetSourceFilterList", requestData, timeoutMs);
}

/** Gets the default settings for a filter kind. */
export async function getSourceFilterDefaultSettings(this: OBSRequestContext, requestData: OBSRequestDataMap["GetSourceFilterDefaultSettings"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSourceFilterDefaultSettings">> {
  return this.request("GetSourceFilterDefaultSettings", requestData, timeoutMs);
}

/** Creates a new filter, adding it to the specified source. */
export async function createSourceFilter(this: OBSRequestContext, requestData: OBSRequestDataMap["CreateSourceFilter"], timeoutMs?: number): Promise<OBSRequestResponse<"CreateSourceFilter">> {
  return this.request("CreateSourceFilter", requestData, timeoutMs);
}

/** Removes a filter from a source. */
export async function removeSourceFilter(this: OBSRequestContext, requestData: OBSRequestDataMap["RemoveSourceFilter"], timeoutMs?: number): Promise<OBSRequestResponse<"RemoveSourceFilter">> {
  return this.request("RemoveSourceFilter", requestData, timeoutMs);
}

/** Sets the name of a source filter (rename). */
export async function setSourceFilterName(this: OBSRequestContext, requestData: OBSRequestDataMap["SetSourceFilterName"], timeoutMs?: number): Promise<OBSRequestResponse<"SetSourceFilterName">> {
  return this.request("SetSourceFilterName", requestData, timeoutMs);
}

/** Gets the info for a specific source filter. */
export async function getSourceFilter(this: OBSRequestContext, requestData: OBSRequestDataMap["GetSourceFilter"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSourceFilter">> {
  return this.request("GetSourceFilter", requestData, timeoutMs);
}

/** Sets the index position of a filter on a source. */
export async function setSourceFilterIndex(this: OBSRequestContext, requestData: OBSRequestDataMap["SetSourceFilterIndex"], timeoutMs?: number): Promise<OBSRequestResponse<"SetSourceFilterIndex">> {
  return this.request("SetSourceFilterIndex", requestData, timeoutMs);
}

/** Sets the settings of a source filter. */
export async function setSourceFilterSettings(this: OBSRequestContext, requestData: OBSRequestDataMap["SetSourceFilterSettings"], timeoutMs?: number): Promise<OBSRequestResponse<"SetSourceFilterSettings">> {
  return this.request("SetSourceFilterSettings", requestData, timeoutMs);
}

/** Sets the enable state of a source filter. */
export async function setSourceFilterEnabled(this: OBSRequestContext, requestData: OBSRequestDataMap["SetSourceFilterEnabled"], timeoutMs?: number): Promise<OBSRequestResponse<"SetSourceFilterEnabled">> {
  return this.request("SetSourceFilterEnabled", requestData, timeoutMs);
}

/** Gets data about the current plugin and RPC version. */
export async function getVersion(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetVersion">> {
  return this.request("GetVersion", timeoutMs);
}

/** Gets statistics about OBS, obs-websocket, and the current session. */
export async function getStats(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetStats">> {
  return this.request("GetStats", timeoutMs);
}

/** Broadcasts a `CustomEvent` to all WebSocket clients. Receivers are clients which are identified and subscribed. */
export async function broadcastCustomEvent(this: OBSRequestContext, requestData: OBSRequestDataMap["BroadcastCustomEvent"], timeoutMs?: number): Promise<OBSRequestResponse<"BroadcastCustomEvent">> {
  return this.request("BroadcastCustomEvent", requestData, timeoutMs);
}

/** Call a request registered to a vendor. A vendor is a unique name registered by a third-party plugin or script, which allows for custom requests and events to be added to obs-websocket. If a plugin or script implements vendor requests or events, documentation is expected to be provided with them. */
export async function callVendorRequest(this: OBSRequestContext, requestData: OBSRequestDataMap["CallVendorRequest"], timeoutMs?: number): Promise<OBSRequestResponse<"CallVendorRequest">> {
  return this.request("CallVendorRequest", requestData, timeoutMs);
}

/** Gets an array of all hotkey names in OBS. Note: Hotkey functionality in obs-websocket comes as-is, and we do not guarantee support if things are broken. In 9/10 usages of hotkey requests, there exists a better, more reliable method via other requests. */
export async function getHotkeyList(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetHotkeyList">> {
  return this.request("GetHotkeyList", timeoutMs);
}

/** Triggers a hotkey using its name. See `GetHotkeyList`. Note: Hotkey functionality in obs-websocket comes as-is, and we do not guarantee support if things are broken. In 9/10 usages of hotkey requests, there exists a better, more reliable method via other requests. */
export async function triggerHotkeyByName(this: OBSRequestContext, requestData: OBSRequestDataMap["TriggerHotkeyByName"], timeoutMs?: number): Promise<OBSRequestResponse<"TriggerHotkeyByName">> {
  return this.request("TriggerHotkeyByName", requestData, timeoutMs);
}

/** Triggers a hotkey using a sequence of keys. Note: Hotkey functionality in obs-websocket comes as-is, and we do not guarantee support if things are broken. In 9/10 usages of hotkey requests, there exists a better, more reliable method via other requests. */
export async function triggerHotkeyByKeySequence(this: OBSRequestContext, requestData?: OBSRequestDataMap["TriggerHotkeyByKeySequence"], timeoutMs?: number): Promise<OBSRequestResponse<"TriggerHotkeyByKeySequence">> {
  return this.request("TriggerHotkeyByKeySequence", requestData, timeoutMs);
}

/** Sleeps for a time duration or number of frames. Only available in request batches with types `SERIAL_REALTIME` or `SERIAL_FRAME`. */
export async function sleep(this: OBSRequestContext, requestData?: OBSRequestDataMap["Sleep"], timeoutMs?: number): Promise<OBSRequestResponse<"Sleep">> {
  return this.request("Sleep", requestData, timeoutMs);
}

/** Gets an array of all inputs in OBS. */
export async function getInputList(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetInputList"], timeoutMs?: number): Promise<OBSRequestResponse<"GetInputList">> {
  return this.request("GetInputList", requestData, timeoutMs);
}

/** Gets an array of all available input kinds in OBS. */
export async function getInputKindList(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetInputKindList"], timeoutMs?: number): Promise<OBSRequestResponse<"GetInputKindList">> {
  return this.request("GetInputKindList", requestData, timeoutMs);
}

/** Gets the names of all special inputs. */
export async function getSpecialInputs(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetSpecialInputs">> {
  return this.request("GetSpecialInputs", timeoutMs);
}

/** Creates a new input, adding it as a scene item to the specified scene. */
export async function createInput(this: OBSRequestContext, requestData: OBSRequestDataMap["CreateInput"], timeoutMs?: number): Promise<OBSRequestResponse<"CreateInput">> {
  return this.request("CreateInput", requestData, timeoutMs);
}

/** Removes an existing input. Note: Will immediately remove all associated scene items. */
export async function removeInput(this: OBSRequestContext, requestData?: OBSRequestDataMap["RemoveInput"], timeoutMs?: number): Promise<OBSRequestResponse<"RemoveInput">> {
  return this.request("RemoveInput", requestData, timeoutMs);
}

/** Sets the name of an input (rename). */
export async function setInputName(this: OBSRequestContext, requestData: OBSRequestDataMap["SetInputName"], timeoutMs?: number): Promise<OBSRequestResponse<"SetInputName">> {
  return this.request("SetInputName", requestData, timeoutMs);
}

/** Gets the default settings for an input kind. */
export async function getInputDefaultSettings(this: OBSRequestContext, requestData: OBSRequestDataMap["GetInputDefaultSettings"], timeoutMs?: number): Promise<OBSRequestResponse<"GetInputDefaultSettings">> {
  return this.request("GetInputDefaultSettings", requestData, timeoutMs);
}

/** Gets the settings of an input. Note: Does not include defaults. To create the entire settings object, overlay `inputSettings` over the `defaultInputSettings` provided by `GetInputDefaultSettings`. */
export async function getInputSettings(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetInputSettings"], timeoutMs?: number): Promise<OBSRequestResponse<"GetInputSettings">> {
  return this.request("GetInputSettings", requestData, timeoutMs);
}

/** Sets the settings of an input. */
export async function setInputSettings(this: OBSRequestContext, requestData: OBSRequestDataMap["SetInputSettings"], timeoutMs?: number): Promise<OBSRequestResponse<"SetInputSettings">> {
  return this.request("SetInputSettings", requestData, timeoutMs);
}

/** Gets the audio mute state of an input. */
export async function getInputMute(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetInputMute"], timeoutMs?: number): Promise<OBSRequestResponse<"GetInputMute">> {
  return this.request("GetInputMute", requestData, timeoutMs);
}

/** Sets the audio mute state of an input. */
export async function setInputMute(this: OBSRequestContext, requestData: OBSRequestDataMap["SetInputMute"], timeoutMs?: number): Promise<OBSRequestResponse<"SetInputMute">> {
  return this.request("SetInputMute", requestData, timeoutMs);
}

/** Toggles the audio mute state of an input. */
export async function toggleInputMute(this: OBSRequestContext, requestData?: OBSRequestDataMap["ToggleInputMute"], timeoutMs?: number): Promise<OBSRequestResponse<"ToggleInputMute">> {
  return this.request("ToggleInputMute", requestData, timeoutMs);
}

/** Gets the current volume setting of an input. */
export async function getInputVolume(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetInputVolume"], timeoutMs?: number): Promise<OBSRequestResponse<"GetInputVolume">> {
  return this.request("GetInputVolume", requestData, timeoutMs);
}

/** Sets the volume setting of an input. */
export async function setInputVolume(this: OBSRequestContext, requestData?: OBSRequestDataMap["SetInputVolume"], timeoutMs?: number): Promise<OBSRequestResponse<"SetInputVolume">> {
  return this.request("SetInputVolume", requestData, timeoutMs);
}

/** Gets the audio balance of an input. */
export async function getInputAudioBalance(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetInputAudioBalance"], timeoutMs?: number): Promise<OBSRequestResponse<"GetInputAudioBalance">> {
  return this.request("GetInputAudioBalance", requestData, timeoutMs);
}

/** Sets the audio balance of an input. */
export async function setInputAudioBalance(this: OBSRequestContext, requestData: OBSRequestDataMap["SetInputAudioBalance"], timeoutMs?: number): Promise<OBSRequestResponse<"SetInputAudioBalance">> {
  return this.request("SetInputAudioBalance", requestData, timeoutMs);
}

/** Gets the audio sync offset of an input. Note: The audio sync offset can be negative too! */
export async function getInputAudioSyncOffset(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetInputAudioSyncOffset"], timeoutMs?: number): Promise<OBSRequestResponse<"GetInputAudioSyncOffset">> {
  return this.request("GetInputAudioSyncOffset", requestData, timeoutMs);
}

/** Sets the audio sync offset of an input. */
export async function setInputAudioSyncOffset(this: OBSRequestContext, requestData: OBSRequestDataMap["SetInputAudioSyncOffset"], timeoutMs?: number): Promise<OBSRequestResponse<"SetInputAudioSyncOffset">> {
  return this.request("SetInputAudioSyncOffset", requestData, timeoutMs);
}

/** Gets the audio monitor type of an input. The available audio monitor types are: - `OBS_MONITORING_TYPE_NONE` - `OBS_MONITORING_TYPE_MONITOR_ONLY` - `OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT` */
export async function getInputAudioMonitorType(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetInputAudioMonitorType"], timeoutMs?: number): Promise<OBSRequestResponse<"GetInputAudioMonitorType">> {
  return this.request("GetInputAudioMonitorType", requestData, timeoutMs);
}

/** Sets the audio monitor type of an input. */
export async function setInputAudioMonitorType(this: OBSRequestContext, requestData: OBSRequestDataMap["SetInputAudioMonitorType"], timeoutMs?: number): Promise<OBSRequestResponse<"SetInputAudioMonitorType">> {
  return this.request("SetInputAudioMonitorType", requestData, timeoutMs);
}

/** Gets the enable state of all audio tracks of an input. */
export async function getInputAudioTracks(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetInputAudioTracks"], timeoutMs?: number): Promise<OBSRequestResponse<"GetInputAudioTracks">> {
  return this.request("GetInputAudioTracks", requestData, timeoutMs);
}

/** Sets the enable state of audio tracks of an input. */
export async function setInputAudioTracks(this: OBSRequestContext, requestData: OBSRequestDataMap["SetInputAudioTracks"], timeoutMs?: number): Promise<OBSRequestResponse<"SetInputAudioTracks">> {
  return this.request("SetInputAudioTracks", requestData, timeoutMs);
}

/** Gets the deinterlace mode of an input. Deinterlace Modes: - `OBS_DEINTERLACE_MODE_DISABLE` - `OBS_DEINTERLACE_MODE_DISCARD` - `OBS_DEINTERLACE_MODE_RETRO` - `OBS_DEINTERLACE_MODE_BLEND` - `OBS_DEINTERLACE_MODE_BLEND_2X` - `OBS_DEINTERLACE_MODE_LINEAR` - `OBS_DEINTERLACE_MODE_LINEAR_2X` - `OBS_DEINTERLACE_MODE_YADIF` - `OBS_DEINTERLACE_MODE_YADIF_2X` Note: Deinterlacing functionality is restricted to async inputs only. */
export async function getInputDeinterlaceMode(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetInputDeinterlaceMode"], timeoutMs?: number): Promise<OBSRequestResponse<"GetInputDeinterlaceMode">> {
  return this.request("GetInputDeinterlaceMode", requestData, timeoutMs);
}

/** Sets the deinterlace mode of an input. Note: Deinterlacing functionality is restricted to async inputs only. */
export async function setInputDeinterlaceMode(this: OBSRequestContext, requestData: OBSRequestDataMap["SetInputDeinterlaceMode"], timeoutMs?: number): Promise<OBSRequestResponse<"SetInputDeinterlaceMode">> {
  return this.request("SetInputDeinterlaceMode", requestData, timeoutMs);
}

/** Gets the deinterlace field order of an input. Deinterlace Field Orders: - `OBS_DEINTERLACE_FIELD_ORDER_TOP` - `OBS_DEINTERLACE_FIELD_ORDER_BOTTOM` Note: Deinterlacing functionality is restricted to async inputs only. */
export async function getInputDeinterlaceFieldOrder(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetInputDeinterlaceFieldOrder"], timeoutMs?: number): Promise<OBSRequestResponse<"GetInputDeinterlaceFieldOrder">> {
  return this.request("GetInputDeinterlaceFieldOrder", requestData, timeoutMs);
}

/** Sets the deinterlace field order of an input. Note: Deinterlacing functionality is restricted to async inputs only. */
export async function setInputDeinterlaceFieldOrder(this: OBSRequestContext, requestData: OBSRequestDataMap["SetInputDeinterlaceFieldOrder"], timeoutMs?: number): Promise<OBSRequestResponse<"SetInputDeinterlaceFieldOrder">> {
  return this.request("SetInputDeinterlaceFieldOrder", requestData, timeoutMs);
}

/** Gets the items of a list property from an input's properties. Note: Use this in cases where an input provides a dynamic, selectable list of items. For example, display capture, where it provides a list of available displays. */
export async function getInputPropertiesListPropertyItems(this: OBSRequestContext, requestData: OBSRequestDataMap["GetInputPropertiesListPropertyItems"], timeoutMs?: number): Promise<OBSRequestResponse<"GetInputPropertiesListPropertyItems">> {
  return this.request("GetInputPropertiesListPropertyItems", requestData, timeoutMs);
}

/** Presses a button in the properties of an input. Some known `propertyName` values are: - `refreshnocache` - Browser source reload button Note: Use this in cases where there is a button in the properties of an input that cannot be accessed in any other way. For example, browser sources, where there is a refresh button. */
export async function pressInputPropertiesButton(this: OBSRequestContext, requestData: OBSRequestDataMap["PressInputPropertiesButton"], timeoutMs?: number): Promise<OBSRequestResponse<"PressInputPropertiesButton">> {
  return this.request("PressInputPropertiesButton", requestData, timeoutMs);
}

/** Gets the status of a media input. Media States: - `OBS_MEDIA_STATE_NONE` - `OBS_MEDIA_STATE_PLAYING` - `OBS_MEDIA_STATE_OPENING` - `OBS_MEDIA_STATE_BUFFERING` - `OBS_MEDIA_STATE_PAUSED` - `OBS_MEDIA_STATE_STOPPED` - `OBS_MEDIA_STATE_ENDED` - `OBS_MEDIA_STATE_ERROR` */
export async function getMediaInputStatus(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetMediaInputStatus"], timeoutMs?: number): Promise<OBSRequestResponse<"GetMediaInputStatus">> {
  return this.request("GetMediaInputStatus", requestData, timeoutMs);
}

/** Sets the cursor position of a media input. This request does not perform bounds checking of the cursor position. */
export async function setMediaInputCursor(this: OBSRequestContext, requestData: OBSRequestDataMap["SetMediaInputCursor"], timeoutMs?: number): Promise<OBSRequestResponse<"SetMediaInputCursor">> {
  return this.request("SetMediaInputCursor", requestData, timeoutMs);
}

/** Offsets the current cursor position of a media input by the specified value. This request does not perform bounds checking of the cursor position. */
export async function offsetMediaInputCursor(this: OBSRequestContext, requestData: OBSRequestDataMap["OffsetMediaInputCursor"], timeoutMs?: number): Promise<OBSRequestResponse<"OffsetMediaInputCursor">> {
  return this.request("OffsetMediaInputCursor", requestData, timeoutMs);
}

/** Triggers an action on a media input. */
export async function triggerMediaInputAction(this: OBSRequestContext, requestData: OBSRequestDataMap["TriggerMediaInputAction"], timeoutMs?: number): Promise<OBSRequestResponse<"TriggerMediaInputAction">> {
  return this.request("TriggerMediaInputAction", requestData, timeoutMs);
}

/** Gets the status of the virtualcam output. */
export async function getVirtualCamStatus(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetVirtualCamStatus">> {
  return this.request("GetVirtualCamStatus", timeoutMs);
}

/** Toggles the state of the virtualcam output. */
export async function toggleVirtualCam(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"ToggleVirtualCam">> {
  return this.request("ToggleVirtualCam", timeoutMs);
}

/** Starts the virtualcam output. */
export async function startVirtualCam(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"StartVirtualCam">> {
  return this.request("StartVirtualCam", timeoutMs);
}

/** Stops the virtualcam output. */
export async function stopVirtualCam(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"StopVirtualCam">> {
  return this.request("StopVirtualCam", timeoutMs);
}

/** Gets the status of the replay buffer output. */
export async function getReplayBufferStatus(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetReplayBufferStatus">> {
  return this.request("GetReplayBufferStatus", timeoutMs);
}

/** Toggles the state of the replay buffer output. */
export async function toggleReplayBuffer(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"ToggleReplayBuffer">> {
  return this.request("ToggleReplayBuffer", timeoutMs);
}

/** Starts the replay buffer output. */
export async function startReplayBuffer(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"StartReplayBuffer">> {
  return this.request("StartReplayBuffer", timeoutMs);
}

/** Stops the replay buffer output. */
export async function stopReplayBuffer(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"StopReplayBuffer">> {
  return this.request("StopReplayBuffer", timeoutMs);
}

/** Saves the contents of the replay buffer output. */
export async function saveReplayBuffer(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"SaveReplayBuffer">> {
  return this.request("SaveReplayBuffer", timeoutMs);
}

/** Gets the filename of the last replay buffer save file. */
export async function getLastReplayBufferReplay(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetLastReplayBufferReplay">> {
  return this.request("GetLastReplayBufferReplay", timeoutMs);
}

/** Gets the list of available outputs. */
export async function getOutputList(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetOutputList">> {
  return this.request("GetOutputList", timeoutMs);
}

/** Gets the status of an output. */
export async function getOutputStatus(this: OBSRequestContext, requestData: OBSRequestDataMap["GetOutputStatus"], timeoutMs?: number): Promise<OBSRequestResponse<"GetOutputStatus">> {
  return this.request("GetOutputStatus", requestData, timeoutMs);
}

/** Toggles the status of an output. */
export async function toggleOutput(this: OBSRequestContext, requestData: OBSRequestDataMap["ToggleOutput"], timeoutMs?: number): Promise<OBSRequestResponse<"ToggleOutput">> {
  return this.request("ToggleOutput", requestData, timeoutMs);
}

/** Starts an output. */
export async function startOutput(this: OBSRequestContext, requestData: OBSRequestDataMap["StartOutput"], timeoutMs?: number): Promise<OBSRequestResponse<"StartOutput">> {
  return this.request("StartOutput", requestData, timeoutMs);
}

/** Stops an output. */
export async function stopOutput(this: OBSRequestContext, requestData: OBSRequestDataMap["StopOutput"], timeoutMs?: number): Promise<OBSRequestResponse<"StopOutput">> {
  return this.request("StopOutput", requestData, timeoutMs);
}

/** Gets the settings of an output. */
export async function getOutputSettings(this: OBSRequestContext, requestData: OBSRequestDataMap["GetOutputSettings"], timeoutMs?: number): Promise<OBSRequestResponse<"GetOutputSettings">> {
  return this.request("GetOutputSettings", requestData, timeoutMs);
}

/** Sets the settings of an output. */
export async function setOutputSettings(this: OBSRequestContext, requestData: OBSRequestDataMap["SetOutputSettings"], timeoutMs?: number): Promise<OBSRequestResponse<"SetOutputSettings">> {
  return this.request("SetOutputSettings", requestData, timeoutMs);
}

/** Gets the status of the record output. */
export async function getRecordStatus(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetRecordStatus">> {
  return this.request("GetRecordStatus", timeoutMs);
}

/** Toggles the status of the record output. */
export async function toggleRecord(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"ToggleRecord">> {
  return this.request("ToggleRecord", timeoutMs);
}

/** Starts the record output. */
export async function startRecord(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"StartRecord">> {
  return this.request("StartRecord", timeoutMs);
}

/** Stops the record output. */
export async function stopRecord(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"StopRecord">> {
  return this.request("StopRecord", timeoutMs);
}

/** Toggles pause on the record output. */
export async function toggleRecordPause(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"ToggleRecordPause">> {
  return this.request("ToggleRecordPause", timeoutMs);
}

/** Pauses the record output. */
export async function pauseRecord(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"PauseRecord">> {
  return this.request("PauseRecord", timeoutMs);
}

/** Resumes the record output. */
export async function resumeRecord(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"ResumeRecord">> {
  return this.request("ResumeRecord", timeoutMs);
}

/** Splits the current file being recorded into a new file. */
export async function splitRecordFile(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"SplitRecordFile">> {
  return this.request("SplitRecordFile", timeoutMs);
}

/** Adds a new chapter marker to the file currently being recorded. Note: As of OBS 30.2.0, the only file format supporting this feature is Hybrid MP4. */
export async function createRecordChapter(this: OBSRequestContext, requestData?: OBSRequestDataMap["CreateRecordChapter"], timeoutMs?: number): Promise<OBSRequestResponse<"CreateRecordChapter">> {
  return this.request("CreateRecordChapter", requestData, timeoutMs);
}

/** Gets a list of all scene items in a scene. Scenes only */
export async function getSceneItemList(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetSceneItemList"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSceneItemList">> {
  return this.request("GetSceneItemList", requestData, timeoutMs);
}

/** Basically GetSceneItemList, but for groups. Using groups at all in OBS is discouraged, as they are very broken under the hood. Please use nested scenes instead. Groups only */
export async function getGroupSceneItemList(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetGroupSceneItemList"], timeoutMs?: number): Promise<OBSRequestResponse<"GetGroupSceneItemList">> {
  return this.request("GetGroupSceneItemList", requestData, timeoutMs);
}

/** Searches a scene for a source, and returns its id. Scenes and Groups */
export async function getSceneItemId(this: OBSRequestContext, requestData: OBSRequestDataMap["GetSceneItemId"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSceneItemId">> {
  return this.request("GetSceneItemId", requestData, timeoutMs);
}

/** Gets the source associated with a scene item. */
export async function getSceneItemSource(this: OBSRequestContext, requestData: OBSRequestDataMap["GetSceneItemSource"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSceneItemSource">> {
  return this.request("GetSceneItemSource", requestData, timeoutMs);
}

/** Creates a new scene item using a source. Scenes only */
export async function createSceneItem(this: OBSRequestContext, requestData?: OBSRequestDataMap["CreateSceneItem"], timeoutMs?: number): Promise<OBSRequestResponse<"CreateSceneItem">> {
  return this.request("CreateSceneItem", requestData, timeoutMs);
}

/** Removes a scene item from a scene. Scenes only */
export async function removeSceneItem(this: OBSRequestContext, requestData: OBSRequestDataMap["RemoveSceneItem"], timeoutMs?: number): Promise<OBSRequestResponse<"RemoveSceneItem">> {
  return this.request("RemoveSceneItem", requestData, timeoutMs);
}

/** Duplicates a scene item, copying all transform and crop info. Scenes only */
export async function duplicateSceneItem(this: OBSRequestContext, requestData: OBSRequestDataMap["DuplicateSceneItem"], timeoutMs?: number): Promise<OBSRequestResponse<"DuplicateSceneItem">> {
  return this.request("DuplicateSceneItem", requestData, timeoutMs);
}

/** Gets the transform and crop info of a scene item. Scenes and Groups */
export async function getSceneItemTransform(this: OBSRequestContext, requestData: OBSRequestDataMap["GetSceneItemTransform"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSceneItemTransform">> {
  return this.request("GetSceneItemTransform", requestData, timeoutMs);
}

/** Sets the transform and crop info of a scene item. */
export async function setSceneItemTransform(this: OBSRequestContext, requestData: OBSRequestDataMap["SetSceneItemTransform"], timeoutMs?: number): Promise<OBSRequestResponse<"SetSceneItemTransform">> {
  return this.request("SetSceneItemTransform", requestData, timeoutMs);
}

/** Gets the enable state of a scene item. Scenes and Groups */
export async function getSceneItemEnabled(this: OBSRequestContext, requestData: OBSRequestDataMap["GetSceneItemEnabled"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSceneItemEnabled">> {
  return this.request("GetSceneItemEnabled", requestData, timeoutMs);
}

/** Sets the enable state of a scene item. Scenes and Groups */
export async function setSceneItemEnabled(this: OBSRequestContext, requestData: OBSRequestDataMap["SetSceneItemEnabled"], timeoutMs?: number): Promise<OBSRequestResponse<"SetSceneItemEnabled">> {
  return this.request("SetSceneItemEnabled", requestData, timeoutMs);
}

/** Gets the lock state of a scene item. Scenes and Groups */
export async function getSceneItemLocked(this: OBSRequestContext, requestData: OBSRequestDataMap["GetSceneItemLocked"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSceneItemLocked">> {
  return this.request("GetSceneItemLocked", requestData, timeoutMs);
}

/** Sets the lock state of a scene item. Scenes and Group */
export async function setSceneItemLocked(this: OBSRequestContext, requestData: OBSRequestDataMap["SetSceneItemLocked"], timeoutMs?: number): Promise<OBSRequestResponse<"SetSceneItemLocked">> {
  return this.request("SetSceneItemLocked", requestData, timeoutMs);
}

/** Gets the index position of a scene item in a scene. An index of 0 is at the bottom of the source list in the UI. Scenes and Groups */
export async function getSceneItemIndex(this: OBSRequestContext, requestData: OBSRequestDataMap["GetSceneItemIndex"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSceneItemIndex">> {
  return this.request("GetSceneItemIndex", requestData, timeoutMs);
}

/** Sets the index position of a scene item in a scene. Scenes and Groups */
export async function setSceneItemIndex(this: OBSRequestContext, requestData: OBSRequestDataMap["SetSceneItemIndex"], timeoutMs?: number): Promise<OBSRequestResponse<"SetSceneItemIndex">> {
  return this.request("SetSceneItemIndex", requestData, timeoutMs);
}

/** Gets the blend mode of a scene item. Blend modes: - `OBS_BLEND_NORMAL` - `OBS_BLEND_ADDITIVE` - `OBS_BLEND_SUBTRACT` - `OBS_BLEND_SCREEN` - `OBS_BLEND_MULTIPLY` - `OBS_BLEND_LIGHTEN` - `OBS_BLEND_DARKEN` Scenes and Groups */
export async function getSceneItemBlendMode(this: OBSRequestContext, requestData: OBSRequestDataMap["GetSceneItemBlendMode"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSceneItemBlendMode">> {
  return this.request("GetSceneItemBlendMode", requestData, timeoutMs);
}

/** Sets the blend mode of a scene item. Scenes and Groups */
export async function setSceneItemBlendMode(this: OBSRequestContext, requestData: OBSRequestDataMap["SetSceneItemBlendMode"], timeoutMs?: number): Promise<OBSRequestResponse<"SetSceneItemBlendMode">> {
  return this.request("SetSceneItemBlendMode", requestData, timeoutMs);
}

/** Gets an array of scenes in OBS. */
export async function getSceneList(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetSceneList"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSceneList">> {
  return this.request("GetSceneList", requestData, timeoutMs);
}

/** Gets an array of all groups in OBS. Groups in OBS are actually scenes, but renamed and modified. In obs-websocket, we treat them as scenes where we can. */
export async function getGroupList(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetGroupList">> {
  return this.request("GetGroupList", timeoutMs);
}

/** Gets the current program scene. Note 1: This request is slated to have the `currentProgram`-prefixed fields removed from in an upcoming RPC version. Note 2: Canvases do not have any concept of a program or preview scene, so this request does not support canvases. */
export async function getCurrentProgramScene(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetCurrentProgramScene">> {
  return this.request("GetCurrentProgramScene", timeoutMs);
}

/** Sets the current program scene. */
export async function setCurrentProgramScene(this: OBSRequestContext, requestData?: OBSRequestDataMap["SetCurrentProgramScene"], timeoutMs?: number): Promise<OBSRequestResponse<"SetCurrentProgramScene">> {
  return this.request("SetCurrentProgramScene", requestData, timeoutMs);
}

/** Gets the current preview scene. Only available when studio mode is enabled. Note: This request is slated to have the `currentPreview`-prefixed fields removed from in an upcoming RPC version. */
export async function getCurrentPreviewScene(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetCurrentPreviewScene">> {
  return this.request("GetCurrentPreviewScene", timeoutMs);
}

/** Sets the current preview scene. Only available when studio mode is enabled. */
export async function setCurrentPreviewScene(this: OBSRequestContext, requestData?: OBSRequestDataMap["SetCurrentPreviewScene"], timeoutMs?: number): Promise<OBSRequestResponse<"SetCurrentPreviewScene">> {
  return this.request("SetCurrentPreviewScene", requestData, timeoutMs);
}

/** Creates a new scene in OBS. */
export async function createScene(this: OBSRequestContext, requestData: OBSRequestDataMap["CreateScene"], timeoutMs?: number): Promise<OBSRequestResponse<"CreateScene">> {
  return this.request("CreateScene", requestData, timeoutMs);
}

/** Removes a scene from OBS. */
export async function removeScene(this: OBSRequestContext, requestData?: OBSRequestDataMap["RemoveScene"], timeoutMs?: number): Promise<OBSRequestResponse<"RemoveScene">> {
  return this.request("RemoveScene", requestData, timeoutMs);
}

/** Sets the name of a scene (rename). */
export async function setSceneName(this: OBSRequestContext, requestData: OBSRequestDataMap["SetSceneName"], timeoutMs?: number): Promise<OBSRequestResponse<"SetSceneName">> {
  return this.request("SetSceneName", requestData, timeoutMs);
}

/** Gets the scene transition overridden for a scene. Note: A transition UUID response field is not currently able to be implemented as of 2024-1-18. */
export async function getSceneSceneTransitionOverride(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetSceneSceneTransitionOverride"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSceneSceneTransitionOverride">> {
  return this.request("GetSceneSceneTransitionOverride", requestData, timeoutMs);
}

/** Sets the scene transition overridden for a scene. */
export async function setSceneSceneTransitionOverride(this: OBSRequestContext, requestData?: OBSRequestDataMap["SetSceneSceneTransitionOverride"], timeoutMs?: number): Promise<OBSRequestResponse<"SetSceneSceneTransitionOverride">> {
  return this.request("SetSceneSceneTransitionOverride", requestData, timeoutMs);
}

/** Gets the active and show state of a source. **Compatible with inputs and scenes.** */
export async function getSourceActive(this: OBSRequestContext, requestData?: OBSRequestDataMap["GetSourceActive"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSourceActive">> {
  return this.request("GetSourceActive", requestData, timeoutMs);
}

/** Gets a Base64-encoded screenshot of a source. The `imageWidth` and `imageHeight` parameters are treated as "scale to inner", meaning the smallest ratio will be used and the aspect ratio of the original resolution is kept. If `imageWidth` and `imageHeight` are not specified, the compressed image will use the full resolution of the source. **Compatible with inputs and scenes.** */
export async function getSourceScreenshot(this: OBSRequestContext, requestData: OBSRequestDataMap["GetSourceScreenshot"], timeoutMs?: number): Promise<OBSRequestResponse<"GetSourceScreenshot">> {
  return this.request("GetSourceScreenshot", requestData, timeoutMs);
}

/** Saves a screenshot of a source to the filesystem. The `imageWidth` and `imageHeight` parameters are treated as "scale to inner", meaning the smallest ratio will be used and the aspect ratio of the original resolution is kept. If `imageWidth` and `imageHeight` are not specified, the compressed image will use the full resolution of the source. **Compatible with inputs and scenes.** */
export async function saveSourceScreenshot(this: OBSRequestContext, requestData: OBSRequestDataMap["SaveSourceScreenshot"], timeoutMs?: number): Promise<OBSRequestResponse<"SaveSourceScreenshot">> {
  return this.request("SaveSourceScreenshot", requestData, timeoutMs);
}

/** Gets the status of the stream output. */
export async function getStreamStatus(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetStreamStatus">> {
  return this.request("GetStreamStatus", timeoutMs);
}

/** Toggles the status of the stream output. */
export async function toggleStream(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"ToggleStream">> {
  return this.request("ToggleStream", timeoutMs);
}

/** Starts the stream output. */
export async function startStream(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"StartStream">> {
  return this.request("StartStream", timeoutMs);
}

/** Stops the stream output. */
export async function stopStream(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"StopStream">> {
  return this.request("StopStream", timeoutMs);
}

/** Sends CEA-608 caption text over the stream output. */
export async function sendStreamCaption(this: OBSRequestContext, requestData: OBSRequestDataMap["SendStreamCaption"], timeoutMs?: number): Promise<OBSRequestResponse<"SendStreamCaption">> {
  return this.request("SendStreamCaption", requestData, timeoutMs);
}

/** Gets an array of all available transition kinds. Similar to `GetInputKindList` */
export async function getTransitionKindList(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetTransitionKindList">> {
  return this.request("GetTransitionKindList", timeoutMs);
}

/** Gets an array of all scene transitions in OBS. */
export async function getSceneTransitionList(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetSceneTransitionList">> {
  return this.request("GetSceneTransitionList", timeoutMs);
}

/** Gets information about the current scene transition. */
export async function getCurrentSceneTransition(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetCurrentSceneTransition">> {
  return this.request("GetCurrentSceneTransition", timeoutMs);
}

/** Sets the current scene transition. Small note: While the namespace of scene transitions is generally unique, that uniqueness is not a guarantee as it is with other resources like inputs. */
export async function setCurrentSceneTransition(this: OBSRequestContext, requestData: OBSRequestDataMap["SetCurrentSceneTransition"], timeoutMs?: number): Promise<OBSRequestResponse<"SetCurrentSceneTransition">> {
  return this.request("SetCurrentSceneTransition", requestData, timeoutMs);
}

/** Sets the duration of the current scene transition, if it is not fixed. */
export async function setCurrentSceneTransitionDuration(this: OBSRequestContext, requestData: OBSRequestDataMap["SetCurrentSceneTransitionDuration"], timeoutMs?: number): Promise<OBSRequestResponse<"SetCurrentSceneTransitionDuration">> {
  return this.request("SetCurrentSceneTransitionDuration", requestData, timeoutMs);
}

/** Sets the settings of the current scene transition. */
export async function setCurrentSceneTransitionSettings(this: OBSRequestContext, requestData: OBSRequestDataMap["SetCurrentSceneTransitionSettings"], timeoutMs?: number): Promise<OBSRequestResponse<"SetCurrentSceneTransitionSettings">> {
  return this.request("SetCurrentSceneTransitionSettings", requestData, timeoutMs);
}

/** Gets the cursor position of the current scene transition. Note: `transitionCursor` will return 1.0 when the transition is inactive. */
export async function getCurrentSceneTransitionCursor(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetCurrentSceneTransitionCursor">> {
  return this.request("GetCurrentSceneTransitionCursor", timeoutMs);
}

/** Triggers the current scene transition. Same functionality as the `Transition` button in studio mode. */
export async function triggerStudioModeTransition(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"TriggerStudioModeTransition">> {
  return this.request("TriggerStudioModeTransition", timeoutMs);
}

/** Sets the position of the TBar. **Very important note**: This will be deprecated and replaced in a future version of obs-websocket. */
export async function setTBarPosition(this: OBSRequestContext, requestData: OBSRequestDataMap["SetTBarPosition"], timeoutMs?: number): Promise<OBSRequestResponse<"SetTBarPosition">> {
  return this.request("SetTBarPosition", requestData, timeoutMs);
}

/** Gets whether studio is enabled. */
export async function getStudioModeEnabled(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetStudioModeEnabled">> {
  return this.request("GetStudioModeEnabled", timeoutMs);
}

/** Enables or disables studio mode */
export async function setStudioModeEnabled(this: OBSRequestContext, requestData: OBSRequestDataMap["SetStudioModeEnabled"], timeoutMs?: number): Promise<OBSRequestResponse<"SetStudioModeEnabled">> {
  return this.request("SetStudioModeEnabled", requestData, timeoutMs);
}

/** Opens the properties dialog of an input. */
export async function openInputPropertiesDialog(this: OBSRequestContext, requestData?: OBSRequestDataMap["OpenInputPropertiesDialog"], timeoutMs?: number): Promise<OBSRequestResponse<"OpenInputPropertiesDialog">> {
  return this.request("OpenInputPropertiesDialog", requestData, timeoutMs);
}

/** Opens the filters dialog of an input. */
export async function openInputFiltersDialog(this: OBSRequestContext, requestData?: OBSRequestDataMap["OpenInputFiltersDialog"], timeoutMs?: number): Promise<OBSRequestResponse<"OpenInputFiltersDialog">> {
  return this.request("OpenInputFiltersDialog", requestData, timeoutMs);
}

/** Opens the interact dialog of an input. */
export async function openInputInteractDialog(this: OBSRequestContext, requestData?: OBSRequestDataMap["OpenInputInteractDialog"], timeoutMs?: number): Promise<OBSRequestResponse<"OpenInputInteractDialog">> {
  return this.request("OpenInputInteractDialog", requestData, timeoutMs);
}

/** Gets a list of connected monitors and information about them. */
export async function getMonitorList(this: OBSRequestContext, timeoutMs?: number): Promise<OBSRequestResponse<"GetMonitorList">> {
  return this.request("GetMonitorList", timeoutMs);
}

/** Opens a projector for a specific output video mix. Mix types: - `OBS_WEBSOCKET_VIDEO_MIX_TYPE_PREVIEW` - `OBS_WEBSOCKET_VIDEO_MIX_TYPE_PROGRAM` - `OBS_WEBSOCKET_VIDEO_MIX_TYPE_MULTIVIEW` Note: This request serves to provide feature parity with 4.x. It is very likely to be changed/deprecated in a future release. */
export async function openVideoMixProjector(this: OBSRequestContext, requestData: OBSRequestDataMap["OpenVideoMixProjector"], timeoutMs?: number): Promise<OBSRequestResponse<"OpenVideoMixProjector">> {
  return this.request("OpenVideoMixProjector", requestData, timeoutMs);
}

/** Opens a projector for a source. Note: This request serves to provide feature parity with 4.x. It is very likely to be changed/deprecated in a future release. */
export async function openSourceProjector(this: OBSRequestContext, requestData?: OBSRequestDataMap["OpenSourceProjector"], timeoutMs?: number): Promise<OBSRequestResponse<"OpenSourceProjector">> {
  return this.request("OpenSourceProjector", requestData, timeoutMs);
}

export function bindOBSRequestFunctions(client: OBSRequestContext): OBSRequestHelpers {
  return {
    getCanvasList: getCanvasList.bind(client),
    getPersistentData: getPersistentData.bind(client),
    setPersistentData: setPersistentData.bind(client),
    getSceneCollectionList: getSceneCollectionList.bind(client),
    setCurrentSceneCollection: setCurrentSceneCollection.bind(client),
    createSceneCollection: createSceneCollection.bind(client),
    getProfileList: getProfileList.bind(client),
    setCurrentProfile: setCurrentProfile.bind(client),
    createProfile: createProfile.bind(client),
    removeProfile: removeProfile.bind(client),
    getProfileParameter: getProfileParameter.bind(client),
    setProfileParameter: setProfileParameter.bind(client),
    getVideoSettings: getVideoSettings.bind(client),
    setVideoSettings: setVideoSettings.bind(client),
    getStreamServiceSettings: getStreamServiceSettings.bind(client),
    setStreamServiceSettings: setStreamServiceSettings.bind(client),
    getRecordDirectory: getRecordDirectory.bind(client),
    setRecordDirectory: setRecordDirectory.bind(client),
    getSourceFilterKindList: getSourceFilterKindList.bind(client),
    getSourceFilterList: getSourceFilterList.bind(client),
    getSourceFilterDefaultSettings: getSourceFilterDefaultSettings.bind(client),
    createSourceFilter: createSourceFilter.bind(client),
    removeSourceFilter: removeSourceFilter.bind(client),
    setSourceFilterName: setSourceFilterName.bind(client),
    getSourceFilter: getSourceFilter.bind(client),
    setSourceFilterIndex: setSourceFilterIndex.bind(client),
    setSourceFilterSettings: setSourceFilterSettings.bind(client),
    setSourceFilterEnabled: setSourceFilterEnabled.bind(client),
    getVersion: getVersion.bind(client),
    getStats: getStats.bind(client),
    broadcastCustomEvent: broadcastCustomEvent.bind(client),
    callVendorRequest: callVendorRequest.bind(client),
    getHotkeyList: getHotkeyList.bind(client),
    triggerHotkeyByName: triggerHotkeyByName.bind(client),
    triggerHotkeyByKeySequence: triggerHotkeyByKeySequence.bind(client),
    sleep: sleep.bind(client),
    getInputList: getInputList.bind(client),
    getInputKindList: getInputKindList.bind(client),
    getSpecialInputs: getSpecialInputs.bind(client),
    createInput: createInput.bind(client),
    removeInput: removeInput.bind(client),
    setInputName: setInputName.bind(client),
    getInputDefaultSettings: getInputDefaultSettings.bind(client),
    getInputSettings: getInputSettings.bind(client),
    setInputSettings: setInputSettings.bind(client),
    getInputMute: getInputMute.bind(client),
    setInputMute: setInputMute.bind(client),
    toggleInputMute: toggleInputMute.bind(client),
    getInputVolume: getInputVolume.bind(client),
    setInputVolume: setInputVolume.bind(client),
    getInputAudioBalance: getInputAudioBalance.bind(client),
    setInputAudioBalance: setInputAudioBalance.bind(client),
    getInputAudioSyncOffset: getInputAudioSyncOffset.bind(client),
    setInputAudioSyncOffset: setInputAudioSyncOffset.bind(client),
    getInputAudioMonitorType: getInputAudioMonitorType.bind(client),
    setInputAudioMonitorType: setInputAudioMonitorType.bind(client),
    getInputAudioTracks: getInputAudioTracks.bind(client),
    setInputAudioTracks: setInputAudioTracks.bind(client),
    getInputDeinterlaceMode: getInputDeinterlaceMode.bind(client),
    setInputDeinterlaceMode: setInputDeinterlaceMode.bind(client),
    getInputDeinterlaceFieldOrder: getInputDeinterlaceFieldOrder.bind(client),
    setInputDeinterlaceFieldOrder: setInputDeinterlaceFieldOrder.bind(client),
    getInputPropertiesListPropertyItems: getInputPropertiesListPropertyItems.bind(client),
    pressInputPropertiesButton: pressInputPropertiesButton.bind(client),
    getMediaInputStatus: getMediaInputStatus.bind(client),
    setMediaInputCursor: setMediaInputCursor.bind(client),
    offsetMediaInputCursor: offsetMediaInputCursor.bind(client),
    triggerMediaInputAction: triggerMediaInputAction.bind(client),
    getVirtualCamStatus: getVirtualCamStatus.bind(client),
    toggleVirtualCam: toggleVirtualCam.bind(client),
    startVirtualCam: startVirtualCam.bind(client),
    stopVirtualCam: stopVirtualCam.bind(client),
    getReplayBufferStatus: getReplayBufferStatus.bind(client),
    toggleReplayBuffer: toggleReplayBuffer.bind(client),
    startReplayBuffer: startReplayBuffer.bind(client),
    stopReplayBuffer: stopReplayBuffer.bind(client),
    saveReplayBuffer: saveReplayBuffer.bind(client),
    getLastReplayBufferReplay: getLastReplayBufferReplay.bind(client),
    getOutputList: getOutputList.bind(client),
    getOutputStatus: getOutputStatus.bind(client),
    toggleOutput: toggleOutput.bind(client),
    startOutput: startOutput.bind(client),
    stopOutput: stopOutput.bind(client),
    getOutputSettings: getOutputSettings.bind(client),
    setOutputSettings: setOutputSettings.bind(client),
    getRecordStatus: getRecordStatus.bind(client),
    toggleRecord: toggleRecord.bind(client),
    startRecord: startRecord.bind(client),
    stopRecord: stopRecord.bind(client),
    toggleRecordPause: toggleRecordPause.bind(client),
    pauseRecord: pauseRecord.bind(client),
    resumeRecord: resumeRecord.bind(client),
    splitRecordFile: splitRecordFile.bind(client),
    createRecordChapter: createRecordChapter.bind(client),
    getSceneItemList: getSceneItemList.bind(client),
    getGroupSceneItemList: getGroupSceneItemList.bind(client),
    getSceneItemId: getSceneItemId.bind(client),
    getSceneItemSource: getSceneItemSource.bind(client),
    createSceneItem: createSceneItem.bind(client),
    removeSceneItem: removeSceneItem.bind(client),
    duplicateSceneItem: duplicateSceneItem.bind(client),
    getSceneItemTransform: getSceneItemTransform.bind(client),
    setSceneItemTransform: setSceneItemTransform.bind(client),
    getSceneItemEnabled: getSceneItemEnabled.bind(client),
    setSceneItemEnabled: setSceneItemEnabled.bind(client),
    getSceneItemLocked: getSceneItemLocked.bind(client),
    setSceneItemLocked: setSceneItemLocked.bind(client),
    getSceneItemIndex: getSceneItemIndex.bind(client),
    setSceneItemIndex: setSceneItemIndex.bind(client),
    getSceneItemBlendMode: getSceneItemBlendMode.bind(client),
    setSceneItemBlendMode: setSceneItemBlendMode.bind(client),
    getSceneList: getSceneList.bind(client),
    getGroupList: getGroupList.bind(client),
    getCurrentProgramScene: getCurrentProgramScene.bind(client),
    setCurrentProgramScene: setCurrentProgramScene.bind(client),
    getCurrentPreviewScene: getCurrentPreviewScene.bind(client),
    setCurrentPreviewScene: setCurrentPreviewScene.bind(client),
    createScene: createScene.bind(client),
    removeScene: removeScene.bind(client),
    setSceneName: setSceneName.bind(client),
    getSceneSceneTransitionOverride: getSceneSceneTransitionOverride.bind(client),
    setSceneSceneTransitionOverride: setSceneSceneTransitionOverride.bind(client),
    getSourceActive: getSourceActive.bind(client),
    getSourceScreenshot: getSourceScreenshot.bind(client),
    saveSourceScreenshot: saveSourceScreenshot.bind(client),
    getStreamStatus: getStreamStatus.bind(client),
    toggleStream: toggleStream.bind(client),
    startStream: startStream.bind(client),
    stopStream: stopStream.bind(client),
    sendStreamCaption: sendStreamCaption.bind(client),
    getTransitionKindList: getTransitionKindList.bind(client),
    getSceneTransitionList: getSceneTransitionList.bind(client),
    getCurrentSceneTransition: getCurrentSceneTransition.bind(client),
    setCurrentSceneTransition: setCurrentSceneTransition.bind(client),
    setCurrentSceneTransitionDuration: setCurrentSceneTransitionDuration.bind(client),
    setCurrentSceneTransitionSettings: setCurrentSceneTransitionSettings.bind(client),
    getCurrentSceneTransitionCursor: getCurrentSceneTransitionCursor.bind(client),
    triggerStudioModeTransition: triggerStudioModeTransition.bind(client),
    setTBarPosition: setTBarPosition.bind(client),
    getStudioModeEnabled: getStudioModeEnabled.bind(client),
    setStudioModeEnabled: setStudioModeEnabled.bind(client),
    openInputPropertiesDialog: openInputPropertiesDialog.bind(client),
    openInputFiltersDialog: openInputFiltersDialog.bind(client),
    openInputInteractDialog: openInputInteractDialog.bind(client),
    getMonitorList: getMonitorList.bind(client),
    openVideoMixProjector: openVideoMixProjector.bind(client),
    openSourceProjector: openSourceProjector.bind(client),
  } as OBSRequestHelpers;
}
