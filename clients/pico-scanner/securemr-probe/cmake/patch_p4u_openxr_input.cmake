# Patch the pinned PICO SecureMR OpenXR sample with PICO 4 Ultra input support.
#
# The upstream sample only suggests generic controller profiles. PICO OS 5.15.9.U on the
# target PICO 4 Ultra reports /interaction_profiles/bytedance/pico4s_controller and requires
# XR_BD_controller_interaction for application-side bindings.
#
# Keep this patch narrow and fail hard when an expected upstream anchor changes.

set(_p4u_openxr_program "${pico_securemr_samples_SOURCE_DIR}/base/openxr_program.cpp")
file(READ "${_p4u_openxr_program}" _p4u_openxr_source)

function(_p4u_replace_if_missing label marker needle replacement)
    string(FIND "${_p4u_openxr_source}" "${marker}" _p4u_marker_match)
    if(NOT _p4u_marker_match EQUAL -1)
        message(STATUS "PICO OpenXR input patch: '${label}' already applied")
        set(_p4u_openxr_source "${_p4u_openxr_source}" PARENT_SCOPE)
        return()
    endif()

    string(FIND "${_p4u_openxr_source}" "${needle}" _p4u_match)
    if(_p4u_match EQUAL -1)
        message(FATAL_ERROR "PICO OpenXR input patch failed: missing anchor '${label}'")
    endif()

    string(REPLACE "${needle}" "${replacement}" _p4u_openxr_source "${_p4u_openxr_source}")
    set(_p4u_openxr_source "${_p4u_openxr_source}" PARENT_SCOPE)
endfunction()

function(_p4u_replace_if_missing_or_superseded label marker superseded_marker needle replacement)
    string(FIND "${_p4u_openxr_source}" "${marker}" _p4u_marker_match)
    if(NOT _p4u_marker_match EQUAL -1)
        message(STATUS "PICO OpenXR input patch: '${label}' already applied")
        set(_p4u_openxr_source "${_p4u_openxr_source}" PARENT_SCOPE)
        return()
    endif()

    string(FIND "${_p4u_openxr_source}" "${superseded_marker}" _p4u_superseded_match)
    if(NOT _p4u_superseded_match EQUAL -1)
        message(STATUS "PICO OpenXR input patch: '${label}' superseded by newer source state")
        set(_p4u_openxr_source "${_p4u_openxr_source}" PARENT_SCOPE)
        return()
    endif()

    string(FIND "${_p4u_openxr_source}" "${needle}" _p4u_match)
    if(_p4u_match EQUAL -1)
        message(FATAL_ERROR "PICO OpenXR input patch failed: missing anchor '${label}'")
    endif()

    string(REPLACE "${needle}" "${replacement}" _p4u_openxr_source "${_p4u_openxr_source}")
    set(_p4u_openxr_source "${_p4u_openxr_source}" PARENT_SCOPE)
endfunction()

set(_capability_anchor [==[
    // Create union of extensions required by platform and graphics plugins.
    std::vector<const char*> extensions;
]==])

set(_capability_replacement [==[
    // Create union of extensions required by platform and graphics plugins.
    std::vector<const char*> extensions;

    // P4U: Probe input capabilities on the actual runtime before enabling vendor extensions.
    uint32_t p4uExtensionCount = 0;
    CHECK_XRCMD(xrEnumerateInstanceExtensionProperties(nullptr, 0, &p4uExtensionCount, nullptr));
    std::vector<XrExtensionProperties> p4uAvailableExtensions(
        p4uExtensionCount, {XR_TYPE_EXTENSION_PROPERTIES});
    CHECK_XRCMD(xrEnumerateInstanceExtensionProperties(
        nullptr,
        static_cast<uint32_t>(p4uAvailableExtensions.size()),
        &p4uExtensionCount,
        p4uAvailableExtensions.data()));

    const auto p4uHasExtension = [&p4uAvailableExtensions](const char* name) {
      return std::any_of(
          p4uAvailableExtensions.begin(),
          p4uAvailableExtensions.end(),
          [name](const XrExtensionProperties& extension) {
            return std::string(extension.extensionName) == name;
          });
    };

    m_picoControllerInteractionSupported =
        p4uHasExtension(XR_BD_CONTROLLER_INTERACTION_EXTENSION_NAME);
    m_handInteractionSupported =
        p4uHasExtension(XR_EXT_HAND_INTERACTION_EXTENSION_NAME);
    m_handTrackingSupported =
        p4uHasExtension(XR_EXT_HAND_TRACKING_EXTENSION_NAME);

    Log::Write(
        Log::Level::Info,
        Fmt("P4U input capabilities: XR_BD_controller_interaction=%s "
            "XR_EXT_hand_interaction=%s XR_EXT_hand_tracking=%s",
            m_picoControllerInteractionSupported ? "yes" : "no",
            m_handInteractionSupported ? "yes" : "no",
            m_handTrackingSupported ? "yes" : "no"));
]==])

_p4u_replace_if_missing(
    "instance extension capability probe"
    "P4U: Probe input capabilities on the actual runtime"
    "${_capability_anchor}"
    "${_capability_replacement}"
)

set(_extension_anchor [==[
    extensions.push_back(XR_FB_DISPLAY_REFRESH_RATE_EXTENSION_NAME);
]==])

set(_controller_extension_replacement [==[
    extensions.push_back(XR_FB_DISPLAY_REFRESH_RATE_EXTENSION_NAME);

    if (m_picoControllerInteractionSupported) {
      extensions.push_back(XR_BD_CONTROLLER_INTERACTION_EXTENSION_NAME);
      Log::Write(Log::Level::Info, "P4U: enabling XR_BD_controller_interaction");
    } else {
      Log::Write(
          Log::Level::Warning,
          "P4U: XR_BD_controller_interaction unavailable; using generic controller bindings only");
    }
]==])

_p4u_replace_if_missing(
    "controller extension enable"
    "P4U: enabling XR_BD_controller_interaction"
    "${_extension_anchor}"
    "${_controller_extension_replacement}"
)

set(_hand_extension_replacement [==[
    extensions.push_back(XR_FB_DISPLAY_REFRESH_RATE_EXTENSION_NAME);

    if (m_handInteractionSupported) {
      extensions.push_back(XR_EXT_HAND_INTERACTION_EXTENSION_NAME);
      Log::Write(Log::Level::Info, "P4U: enabling XR_EXT_hand_interaction");
    } else {
      Log::Write(
          Log::Level::Warning,
          "P4U: XR_EXT_hand_interaction unavailable; hand HUD fallback disabled");
    }
]==])

_p4u_replace_if_missing(
    "hand interaction extension enable"
    "P4U: enabling XR_EXT_hand_interaction"
    "${_extension_anchor}"
    "${_hand_extension_replacement}"
)

set(_binding_anchor [==[
    XrActionSpaceCreateInfo actionSpaceInfo{XR_TYPE_ACTION_SPACE_CREATE_INFO};
]==])

set(_controller_binding_replacement [==[
    // P4U: Explicit PICO 4 Ultra / PICO 4S bindings. The target runtime reports this
    // interaction profile on PICO OS 5.15.9.U. Use aim pose for the future HUD ray and
    // trigger/value for semantic activation; keep haptics on the physical controllers.
    if (m_picoControllerInteractionSupported) {
      XrPath pico4sProfilePath;
      XrPath leftAimPosePath;
      XrPath rightAimPosePath;

      CHECK_XRCMD(xrStringToPath(
          m_instance,
          "/interaction_profiles/bytedance/pico4s_controller",
          &pico4sProfilePath));
      CHECK_XRCMD(xrStringToPath(
          m_instance,
          "/user/hand/left/input/aim/pose",
          &leftAimPosePath));
      CHECK_XRCMD(xrStringToPath(
          m_instance,
          "/user/hand/right/input/aim/pose",
          &rightAimPosePath));

      std::vector<XrActionSuggestedBinding> pico4sBindings{{
          {m_input.grabAction, triggerValuePath[Side::LEFT]},
          {m_input.grabAction, triggerValuePath[Side::RIGHT]},
          {m_input.poseAction, leftAimPosePath},
          {m_input.poseAction, rightAimPosePath},
          {m_input.quitAction, menuClickPath[Side::LEFT]},
          {m_input.vibrateAction, hapticPath[Side::LEFT]},
          {m_input.vibrateAction, hapticPath[Side::RIGHT]},
      }};

      XrInteractionProfileSuggestedBinding pico4sSuggestedBindings{
          XR_TYPE_INTERACTION_PROFILE_SUGGESTED_BINDING};
      pico4sSuggestedBindings.interactionProfile = pico4sProfilePath;
      pico4sSuggestedBindings.suggestedBindings = pico4sBindings.data();
      pico4sSuggestedBindings.countSuggestedBindings =
          static_cast<uint32_t>(pico4sBindings.size());
      CHECK_XRCMD(xrSuggestInteractionProfileBindings(
          m_instance, &pico4sSuggestedBindings));

      Log::Write(
          Log::Level::Info,
          "P4U: suggested bindings for /interaction_profiles/bytedance/pico4s_controller");
    }

    XrActionSpaceCreateInfo actionSpaceInfo{XR_TYPE_ACTION_SPACE_CREATE_INFO};
]==])

_p4u_replace_if_missing(
    "PICO 4S interaction profile bindings"
    "P4U: suggested bindings for /interaction_profiles/bytedance/pico4s_controller"
    "${_binding_anchor}"
    "${_controller_binding_replacement}"
)

set(_hand_binding_replacement [==[
    // P4U: Hand interaction is a semantic fallback for the same HUD controls, not a
    // separate input mode. Pinch drives the existing grab/activate action and hand aim
    // drives the same pose action used by controller aim. No hand haptic or hand-only
    // menu binding is introduced.
    if (m_handInteractionSupported) {
      XrPath handInteractionProfilePath;
      XrPath leftHandAimPosePath;
      XrPath rightHandAimPosePath;
      XrPath leftPinchValuePath;
      XrPath rightPinchValuePath;

      CHECK_XRCMD(xrStringToPath(
          m_instance,
          "/interaction_profiles/ext/hand_interaction_ext",
          &handInteractionProfilePath));
      CHECK_XRCMD(xrStringToPath(
          m_instance,
          "/user/hand/left/input/aim/pose",
          &leftHandAimPosePath));
      CHECK_XRCMD(xrStringToPath(
          m_instance,
          "/user/hand/right/input/aim/pose",
          &rightHandAimPosePath));
      CHECK_XRCMD(xrStringToPath(
          m_instance,
          "/user/hand/left/input/pinch_ext/value",
          &leftPinchValuePath));
      CHECK_XRCMD(xrStringToPath(
          m_instance,
          "/user/hand/right/input/pinch_ext/value",
          &rightPinchValuePath));

      std::vector<XrActionSuggestedBinding> handInteractionBindings{{
          {m_input.grabAction, leftPinchValuePath},
          {m_input.grabAction, rightPinchValuePath},
          {m_input.poseAction, leftHandAimPosePath},
          {m_input.poseAction, rightHandAimPosePath},
      }};

      XrInteractionProfileSuggestedBinding handInteractionSuggestedBindings{
          XR_TYPE_INTERACTION_PROFILE_SUGGESTED_BINDING};
      handInteractionSuggestedBindings.interactionProfile = handInteractionProfilePath;
      handInteractionSuggestedBindings.suggestedBindings = handInteractionBindings.data();
      handInteractionSuggestedBindings.countSuggestedBindings =
          static_cast<uint32_t>(handInteractionBindings.size());
      CHECK_XRCMD(xrSuggestInteractionProfileBindings(
          m_instance, &handInteractionSuggestedBindings));

      Log::Write(
          Log::Level::Info,
          "P4U: suggested hand fallback bindings for /interaction_profiles/ext/hand_interaction_ext");
    }

    XrActionSpaceCreateInfo actionSpaceInfo{XR_TYPE_ACTION_SPACE_CREATE_INFO};
]==])

_p4u_replace_if_missing(
    "hand interaction profile bindings"
    "P4U: suggested hand fallback bindings for /interaction_profiles/ext/hand_interaction_ext"
    "${_binding_anchor}"
    "${_hand_binding_replacement}"
)

set(_member_anchor [==[
  bool m_sessionRunning{false};

  XrEventDataBuffer m_eventDataBuffer;
]==])

set(_member_replacement [==[
  bool m_sessionRunning{false};

  // P4U input capability snapshot taken before xrCreateInstance.
  bool m_picoControllerInteractionSupported{false};
  bool m_handInteractionSupported{false};
  bool m_handTrackingSupported{false};

  XrEventDataBuffer m_eventDataBuffer;
]==])

_p4u_replace_if_missing(
    "input capability state"
    "m_picoControllerInteractionSupported{false}"
    "${_member_anchor}"
    "${_member_replacement}"
)


# P4U: XR_EXT_hand_interaction bindings are profile-driven. PICO OS can continue to expose
# pico4s_controller as the current interaction profile even while system hand gestures are active.
# Add an independent XR_EXT_hand_tracking path so fingers remain a real fallback when controller
# action poses are inactive.

set(_hand_tracking_extension_replacement [==[
    extensions.push_back(XR_FB_DISPLAY_REFRESH_RATE_EXTENSION_NAME);

    if (m_handTrackingSupported) {
      extensions.push_back(XR_EXT_HAND_TRACKING_EXTENSION_NAME);
      Log::Write(Log::Level::Info, "P4U: enabling XR_EXT_hand_tracking");
    } else {
      Log::Write(
          Log::Level::Warning,
          "P4U: XR_EXT_hand_tracking unavailable; direct hand fallback disabled");
    }
]==])

_p4u_replace_if_missing(
    "direct hand tracking extension enable"
    "P4U: enabling XR_EXT_hand_tracking"
    "${_extension_anchor}"
    "${_hand_tracking_extension_replacement}"
)

set(_direct_hand_member_anchor [==[
  bool m_handTrackingSupported{false};

  XrEventDataBuffer m_eventDataBuffer;
]==])

set(_direct_hand_member_replacement [==[
  bool m_handTrackingSupported{false};
  bool m_handTrackingSystemSupported{false};

  // P4U: Direct XR_EXT_hand_tracking fallback. This path is intentionally independent
  // of xrGetCurrentInteractionProfile so PICO may keep pico4s_controller active while
  // finger tracking still drives product interaction.
  PFN_xrCreateHandTrackerEXT m_xrCreateHandTrackerEXT{nullptr};
  PFN_xrDestroyHandTrackerEXT m_xrDestroyHandTrackerEXT{nullptr};
  PFN_xrLocateHandJointsEXT m_xrLocateHandJointsEXT{nullptr};
  std::array<XrHandTrackerEXT, Side::COUNT> m_p4uHandTrackers{{XR_NULL_HANDLE, XR_NULL_HANDLE}};
  std::array<std::array<XrHandJointLocationEXT, XR_HAND_JOINT_COUNT_EXT>, Side::COUNT>
      m_p4uHandJoints{};
  std::array<bool, Side::COUNT> m_p4uHandPinched{{false, false}};
  std::array<bool, Side::COUNT> m_p4uDirectHandWasActive{{false, false}};
  std::array<uint32_t, Side::COUNT> m_p4uHandProbeCounter{{0, 0}};
  std::array<XrPosef, Side::COUNT> m_p4uPreviousControllerPose{};
  std::array<bool, Side::COUNT> m_p4uPreviousControllerPoseValid{{false, false}};
  std::array<uint32_t, Side::COUNT> m_p4uControllerRecentFrames{{0, 0}};
  std::array<int, Side::COUNT> m_p4uPointerSource{{0, 0}};

  XrEventDataBuffer m_eventDataBuffer;
]==])

_p4u_replace_if_missing(
    "direct hand tracking state"
    "m_xrCreateHandTrackerEXT{nullptr}"
    "${_direct_hand_member_anchor}"
    "${_direct_hand_member_replacement}"
)

set(_direct_hand_init_anchor [==[
  void CreateVisualizedSpaces() {
]==])

set(_direct_hand_init_replacement [==[
  // P4U: initialize direct XR_EXT_hand_tracking fallback.
  void InitializeP4uHandTracking() {
    if (!m_handTrackingSupported) {
      return;
    }

    PFN_xrVoidFunction function = nullptr;

    CHECK_XRCMD(xrGetInstanceProcAddr(m_instance, "xrCreateHandTrackerEXT", &function));
    CHECK(function != nullptr);
    m_xrCreateHandTrackerEXT = reinterpret_cast<PFN_xrCreateHandTrackerEXT>(function);

    function = nullptr;
    CHECK_XRCMD(xrGetInstanceProcAddr(m_instance, "xrDestroyHandTrackerEXT", &function));
    CHECK(function != nullptr);
    m_xrDestroyHandTrackerEXT = reinterpret_cast<PFN_xrDestroyHandTrackerEXT>(function);

    function = nullptr;
    CHECK_XRCMD(xrGetInstanceProcAddr(m_instance, "xrLocateHandJointsEXT", &function));
    CHECK(function != nullptr);
    m_xrLocateHandJointsEXT = reinterpret_cast<PFN_xrLocateHandJointsEXT>(function);

    for (auto hand : {Side::LEFT, Side::RIGHT}) {
      XrHandTrackerCreateInfoEXT createInfo{XR_TYPE_HAND_TRACKER_CREATE_INFO_EXT};
      createInfo.hand = hand == Side::LEFT ? XR_HAND_LEFT_EXT : XR_HAND_RIGHT_EXT;
      createInfo.handJointSet = XR_HAND_JOINT_SET_DEFAULT_EXT;
      CHECK_XRCMD(m_xrCreateHandTrackerEXT(m_session, &createInfo, &m_p4uHandTrackers[hand]));
    }

    Log::Write(
        Log::Level::Info,
        "P4U: direct XR_EXT_hand_tracking fallback initialized for both hands");
  }

  void CreateVisualizedSpaces() {
]==])

_p4u_replace_if_missing(
    "direct hand tracking initializer"
    "P4U: initialize direct XR_EXT_hand_tracking fallback"
    "${_direct_hand_init_anchor}"
    "${_direct_hand_init_replacement}"
)

set(_direct_hand_init_call_anchor [==[
    LogReferenceSpaces();
    InitializeActions();
    CreateVisualizedSpaces();
]==])

set(_direct_hand_init_call_replacement [==[
    LogReferenceSpaces();
    InitializeActions();
    InitializeP4uHandTracking();
    CreateVisualizedSpaces();
]==])

_p4u_replace_if_missing(
    "direct hand tracking initializer call"
    "InitializeP4uHandTracking();"
    "${_direct_hand_init_call_anchor}"
    "${_direct_hand_init_call_replacement}"
)

set(_direct_hand_destroy_anchor [==[
  ~OpenXrProgram() override {
    if (m_input.actionSet != XR_NULL_HANDLE) {
]==])

set(_direct_hand_destroy_replacement [==[
  ~OpenXrProgram() override {
    if (m_xrDestroyHandTrackerEXT != nullptr) {
      for (auto hand : {Side::LEFT, Side::RIGHT}) {
        if (m_p4uHandTrackers[hand] != XR_NULL_HANDLE) {
          m_xrDestroyHandTrackerEXT(m_p4uHandTrackers[hand]);
          m_p4uHandTrackers[hand] = XR_NULL_HANDLE;
        }
      }
    }

    if (m_input.actionSet != XR_NULL_HANDLE) {
]==])

_p4u_replace_if_missing(
    "direct hand tracker cleanup"
    "m_xrDestroyHandTrackerEXT(m_p4uHandTrackers[hand])"
    "${_direct_hand_destroy_anchor}"
    "${_direct_hand_destroy_replacement}"
)

set(_direct_hand_render_anchor [==[
    // Optionally render a 10cm cube scaled by grabAction for each hand. Note renderHand will only be
    // true when the application has focus.
    std::array<XrVector3f*, 2> handDeltas{};
    std::array<std::optional<XrPosef>, 2> handPoses{};
    bool buttonPressed = false;
    for (auto hand : {Side::LEFT, Side::RIGHT}) {
      XrSpaceLocation spaceLocation{XR_TYPE_SPACE_LOCATION};
      res = xrLocateSpace(m_input.handSpace[hand], m_appSpace, predictedDisplayTime, &spaceLocation);
      CHECK_XRRESULT(res, "xrLocateSpace");
      if (XR_UNQUALIFIED_SUCCESS(res)) {
        if ((spaceLocation.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0 &&
            (spaceLocation.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT) != 0) {
          float scale = 0.1f * m_input.handScale[hand];
          if (renderControllerCubes) {
            cubes.push_back(Cube{spaceLocation.pose, {scale, scale, scale}});
          }
          handPoses[hand] = spaceLocation.pose;

          if (m_input.handToggle[hand] == InputState::PRESS_DOWN) {
            if (!m_input.toggleStartPosition[hand]) {
              // no recorded pose --- first pressed down
              m_input.toggleStartPosition[hand] = spaceLocation.pose.position;
              buttonPressed = true;
            }
          } else if (m_input.handToggle[hand] == InputState::RELEASE) {
            if (m_input.toggleStartPosition[hand]) {
              // has recorded pose --- first release
              auto& [x, y, z] = *m_input.toggleStartPosition[hand];
              handDeltas[hand] = new XrVector3f{.x = spaceLocation.pose.position.x - x,
                                                .y = spaceLocation.pose.position.y - y,
                                                .z = spaceLocation.pose.position.z - z};

              m_input.toggleStartPosition[hand] = std::nullopt;
            }
          }  // else: unknown status
        }
      } else {
        // Tracking loss is expected when the hand is not active so only log a message
        // if the hand is active.
        if (m_input.handActive[hand] == XR_TRUE) {
          const char* handName[] = {"left", "right"};
          Log::Write(Log::Level::Verbose,
                     Fmt("Unable to locate %s hand action space in app space: %d", handName[hand], res));
        }
      }
    }
]==])

set(_direct_hand_render_replacement [==[
    // Resolve product pointer/activation input from both sources every frame.
    // P4U: source arbitration follows recent real interaction, not tracking validity alone.
    std::array<XrVector3f*, 2> handDeltas{};
    std::array<std::optional<XrPosef>, 2> handPoses{};
    bool buttonPressed = false;
    for (auto hand : {Side::LEFT, Side::RIGHT}) {
      std::optional<XrPosef> resolvedPose;
      const InputState::ToggleStatus controllerToggle = m_input.handToggle[hand];
      bool controllerPoseValid = false;
      XrPosef controllerPose{};
      bool directHandActive = false;
      XrPosef directHandPose{};
      InputState::ToggleStatus directHandToggle = InputState::RELEASE;
      float directHandScale = 1.0f;

      XrSpaceLocation spaceLocation{XR_TYPE_SPACE_LOCATION};
      res = xrLocateSpace(m_input.handSpace[hand], m_appSpace, predictedDisplayTime, &spaceLocation);
      CHECK_XRRESULT(res, "xrLocateSpace");
      if (XR_UNQUALIFIED_SUCCESS(res) &&
          (spaceLocation.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0 &&
          (spaceLocation.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT) != 0) {
        controllerPose = spaceLocation.pose;
        controllerPoseValid = true;

        // P4U: A merely valid controller pose is not proof that the controller is the
        // user's active input source. Detect real movement and keep the controller sticky
        // briefly so hand tracking cannot steal the pointer while aiming.
        if (m_p4uPreviousControllerPoseValid[hand]) {
          const XrPosef& previous = m_p4uPreviousControllerPose[hand];
          const float dx = controllerPose.position.x - previous.position.x;
          const float dy = controllerPose.position.y - previous.position.y;
          const float dz = controllerPose.position.z - previous.position.z;
          const float positionDeltaSq = dx * dx + dy * dy + dz * dz;
          const float quaternionDot =
              std::abs(controllerPose.orientation.x * previous.orientation.x +
                       controllerPose.orientation.y * previous.orientation.y +
                       controllerPose.orientation.z * previous.orientation.z +
                       controllerPose.orientation.w * previous.orientation.w);
          const float angularDelta =
              2.0f * std::acos(std::min(1.0f, std::max(0.0f, quaternionDot)));

          if (positionDeltaSq >= 0.000036f || angularDelta >= 0.020f) {
            m_p4uControllerRecentFrames[hand] = 90;
          }
        }
        m_p4uPreviousControllerPose[hand] = controllerPose;
        m_p4uPreviousControllerPoseValid[hand] = true;
      } else {
        m_p4uPreviousControllerPoseValid[hand] = false;
        m_p4uControllerRecentFrames[hand] = 0;
      }

      // Trigger input is unambiguous user intent and immediately gives the controller
      // ownership, even if the controller was held perfectly still before the press.
      if (controllerToggle == InputState::PRESS_DOWN) {
        m_p4uControllerRecentFrames[hand] = 90;
      }

      if (m_handTrackingSupported &&
          m_xrLocateHandJointsEXT != nullptr &&
          m_p4uHandTrackers[hand] != XR_NULL_HANDLE) {
        XrHandJointsLocateInfoEXT locateInfo{XR_TYPE_HAND_JOINTS_LOCATE_INFO_EXT};
        locateInfo.baseSpace = m_appSpace;
        locateInfo.time = predictedDisplayTime;

        XrHandJointLocationsEXT locations{XR_TYPE_HAND_JOINT_LOCATIONS_EXT};
        locations.jointCount = XR_HAND_JOINT_COUNT_EXT;
        locations.jointLocations = m_p4uHandJoints[hand].data();

        const XrResult handResult =
            m_xrLocateHandJointsEXT(m_p4uHandTrackers[hand], &locateInfo, &locations);

        const auto& palm = m_p4uHandJoints[hand][XR_HAND_JOINT_PALM_EXT];
        const auto& thumbTip = m_p4uHandJoints[hand][XR_HAND_JOINT_THUMB_TIP_EXT];
        const auto& indexTip = m_p4uHandJoints[hand][XR_HAND_JOINT_INDEX_TIP_EXT];

        const bool palmValid =
            (palm.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0 &&
            (palm.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT) != 0;
        const bool pinchJointsValid =
            (thumbTip.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0 &&
            (indexTip.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0;

        // PICO's native OpenXR sample does not gate joint usability on
        // XrHandJointLocationsEXT::isActive. On PICO OS this flag may remain false even
        // while individual joints carry valid tracking data, so use the joint flags as
        // the authoritative signal.
        const bool directActive =
            XR_UNQUALIFIED_SUCCESS(handResult) && palmValid && pinchJointsValid;

        // P4U: throttle hand-joint diagnostics to roughly once per second per hand.
        // This makes runtime-specific flag behavior observable without flooding logcat.
        if ((++m_p4uHandProbeCounter[hand] % 90u) == 1u) {
          const char* handName[] = {"left", "right"};
          Log::Write(
              Log::Level::Info,
              Fmt("P4U: hand probe (%s) result=%d isActive=%d "
                  "palmFlags=0x%llx thumbFlags=0x%llx indexFlags=0x%llx "
                  "palmValid=%s pinchJointsValid=%s directActive=%s",
                  handName[hand],
                  handResult,
                  locations.isActive,
                  static_cast<unsigned long long>(palm.locationFlags),
                  static_cast<unsigned long long>(thumbTip.locationFlags),
                  static_cast<unsigned long long>(indexTip.locationFlags),
                  palmValid ? "yes" : "no",
                  pinchJointsValid ? "yes" : "no",
                  directActive ? "yes" : "no"));
        }

        if (directActive) {
          // P4U: the interaction pointer originates at the index fingertip, not the palm.
          // This matches the user's perceived pointing point and avoids a hand-center cursor.
          directHandActive = true;
          directHandPose = indexTip.pose;

          const float dx = thumbTip.pose.position.x - indexTip.pose.position.x;
          const float dy = thumbTip.pose.position.y - indexTip.pose.position.y;
          const float dz = thumbTip.pose.position.z - indexTip.pose.position.z;
          const float pinchDistance = std::sqrt(dx * dx + dy * dy + dz * dz);

          // Hysteresis prevents a noisy thumb/index distance around the threshold from
          // generating repeated button edges.
          const bool previousPinch = m_p4uHandPinched[hand];
          bool pinched = previousPinch;
          if (!pinched && pinchDistance <= 0.028f) {
            pinched = true;
          } else if (pinched && pinchDistance >= 0.045f) {
            pinched = false;
          }

          m_p4uHandPinched[hand] = pinched;
          directHandToggle =
              pinched ? InputState::PRESS_DOWN : InputState::RELEASE;

          const float pinchValue =
              std::min(1.0f, std::max(0.0f, (0.060f - pinchDistance) / 0.040f));
          directHandScale = 1.0f - 0.5f * pinchValue;

          const char* handName[] = {"left", "right"};
          if (!m_p4uDirectHandWasActive[hand]) {
            Log::Write(
                Log::Level::Info,
                Fmt("P4U: direct hand fallback active (%s)", handName[hand]));
          }
          if (pinched != previousPinch) {
            Log::Write(
                Log::Level::Info,
                Fmt("P4U: direct hand pinch %s (%s, distance=%.3fm)",
                    pinched ? "down" : "up",
                    handName[hand],
                    pinchDistance));
          }
          m_p4uDirectHandWasActive[hand] = true;
        } else {
          if (m_p4uDirectHandWasActive[hand]) {
            const char* handName[] = {"left", "right"};
            Log::Write(
                Log::Level::Info,
                Fmt("P4U: direct hand fallback inactive (%s)", handName[hand]));
          }
          m_p4uDirectHandWasActive[hand] = false;
          m_p4uHandPinched[hand] = false;
        }
      }

      // P4U: arbitrate by recent *actual* use, not merely by tracking validity.
      // Controller movement/trigger wins immediately. Otherwise a valid direct hand takes
      // over. If no hand is available, a valid controller pose remains the fallback.
      const bool controllerRecent =
          controllerPoseValid && m_p4uControllerRecentFrames[hand] > 0;
      const bool useController =
          controllerPoseValid && (controllerRecent || !directHandActive);
      const int selectedSource = useController ? 1 : (directHandActive ? 2 : 0);

      if (useController) {
        resolvedPose = controllerPose;
        m_input.handActive[hand] = XR_TRUE;
        m_input.handToggle[hand] = controllerToggle;
      } else if (directHandActive) {
        resolvedPose = directHandPose;
        m_input.handActive[hand] = XR_TRUE;
        m_input.handToggle[hand] = directHandToggle;
        m_input.handScale[hand] = directHandScale;
      } else {
        resolvedPose.reset();
      }

      if (selectedSource != m_p4uPointerSource[hand]) {
        const char* handName[] = {"left", "right"};
        const char* sourceName[] = {"none", "controller", "hand"};
        Log::Write(
            Log::Level::Info,
            Fmt("P4U: pointer source (%s)=%s", handName[hand], sourceName[selectedSource]));
        m_p4uPointerSource[hand] = selectedSource;
      }

      if (m_p4uControllerRecentFrames[hand] > 0) {
        --m_p4uControllerRecentFrames[hand];
      }

      if (resolvedPose) {
        const XrPosef& pose = *resolvedPose;
        float scale = 0.1f * m_input.handScale[hand];
        if (renderControllerCubes) {
          cubes.push_back(Cube{pose, {scale, scale, scale}});
        }
        handPoses[hand] = pose;

        if (m_input.handToggle[hand] == InputState::PRESS_DOWN) {
          if (!m_input.toggleStartPosition[hand]) {
            m_input.toggleStartPosition[hand] = pose.position;
            buttonPressed = true;
          }
        } else if (m_input.handToggle[hand] == InputState::RELEASE) {
          if (m_input.toggleStartPosition[hand]) {
            auto& [x, y, z] = *m_input.toggleStartPosition[hand];
            handDeltas[hand] = new XrVector3f{.x = pose.position.x - x,
                                              .y = pose.position.y - y,
                                              .z = pose.position.z - z};
            m_input.toggleStartPosition[hand] = std::nullopt;
          }
        }
      } else if (m_input.handActive[hand] == XR_TRUE) {
        const char* handName[] = {"left", "right"};
        Log::Write(
            Log::Level::Verbose,
            Fmt("Unable to resolve %s controller or direct hand pose", handName[hand]));
      }
    }
]==])

_p4u_replace_if_missing(
    "direct hand tracking render fallback"
    "P4U: direct hand fallback active"
    "${_direct_hand_render_anchor}"
    "${_direct_hand_render_replacement}"
)

set(_direct_hand_priority_old [==[
    // Resolve product pointer/activation input controller-first. If the controller action
    // pose is unavailable, fall back to XR_EXT_hand_tracking directly; this does not depend
    // on the runtime's current interaction profile.
]==])

set(_direct_hand_priority_new [==[
    // Resolve product pointer/activation input from both sources every frame. PICO OS may
    // keep a stale/idle controller action pose valid while the user is actually using hands,
    // so an active XR_EXT_hand_tracking result must be allowed to override that pose.
    // P4U: active hand tracking overrides stale controller pose.
]==])

_p4u_replace_if_missing_or_superseded(
    "direct hand source priority v2"
    "P4U: active hand tracking overrides stale controller pose"
    "P4U: arbitrate by recent *actual* use"
    "${_direct_hand_priority_old}"
    "${_direct_hand_priority_new}"
)

set(_direct_hand_priority_reset_old [==[
        resolvedPose = spaceLocation.pose;

        // A valid controller action pose wins over the direct hand fallback.
        m_p4uDirectHandWasActive[hand] = false;
        m_p4uHandPinched[hand] = false;
]==])

set(_direct_hand_priority_reset_new [==[
        resolvedPose = spaceLocation.pose;
]==])

_p4u_replace_if_missing_or_superseded(
    "direct hand source priority reset v2"
    "P4U: active hand tracking overrides stale controller pose"
    "P4U: arbitrate by recent *actual* use"
    "${_direct_hand_priority_reset_old}"
    "${_direct_hand_priority_reset_new}"
)

set(_direct_hand_priority_condition_old [==[
      if (!resolvedPose && m_handTrackingSupported &&
]==])

set(_direct_hand_priority_condition_new [==[
      if (m_handTrackingSupported &&
]==])

_p4u_replace_if_missing_or_superseded(
    "direct hand source priority condition v2"
    "P4U: active hand tracking overrides stale controller pose"
    "P4U: arbitrate by recent *actual* use"
    "${_direct_hand_priority_condition_old}"
    "${_direct_hand_priority_condition_new}"
)

set(_direct_hand_activity_old [==[
        const bool directActive =
            XR_UNQUALIFIED_SUCCESS(handResult) && locations.isActive == XR_TRUE &&
            palmValid && pinchJointsValid;
]==])

set(_direct_hand_activity_new [==[
        // PICO's native OpenXR sample does not gate joint usability on
        // XrHandJointLocationsEXT::isActive. On PICO OS this flag may remain false even
        // while individual joints carry valid tracking data, so use the joint flags as
        // the authoritative signal.
        const bool directActive =
            XR_UNQUALIFIED_SUCCESS(handResult) && palmValid && pinchJointsValid;
]==])

_p4u_replace_if_missing(
    "direct hand activity semantics v3"
    "PICO's native OpenXR sample does not gate joint usability"
    "${_direct_hand_activity_old}"
    "${_direct_hand_activity_new}"
)

set(_direct_hand_diag_member_old [==[
  std::array<bool, Side::COUNT> m_p4uHandPinched{{false, false}};
  std::array<bool, Side::COUNT> m_p4uDirectHandWasActive{{false, false}};

  XrEventDataBuffer m_eventDataBuffer;
]==])

set(_direct_hand_diag_member_new [==[
  std::array<bool, Side::COUNT> m_p4uHandPinched{{false, false}};
  std::array<bool, Side::COUNT> m_p4uDirectHandWasActive{{false, false}};
  std::array<uint32_t, Side::COUNT> m_p4uHandProbeCounter{{0, 0}};

  XrEventDataBuffer m_eventDataBuffer;
]==])

_p4u_replace_if_missing(
    "direct hand probe counter v4"
    "m_p4uHandProbeCounter{{0, 0}}"
    "${_direct_hand_diag_member_old}"
    "${_direct_hand_diag_member_new}"
)

set(_direct_hand_diag_old [==[
        const bool directActive =
            XR_UNQUALIFIED_SUCCESS(handResult) && palmValid && pinchJointsValid;

        if (directActive) {
]==])

set(_direct_hand_diag_new [==[
        const bool directActive =
            XR_UNQUALIFIED_SUCCESS(handResult) && palmValid && pinchJointsValid;

        // P4U: throttle hand-joint diagnostics to roughly once per second per hand.
        // This makes runtime-specific flag behavior observable without flooding logcat.
        if ((++m_p4uHandProbeCounter[hand] % 90u) == 1u) {
          const char* handName[] = {"left", "right"};
          Log::Write(
              Log::Level::Info,
              Fmt("P4U: hand probe (%s) result=%d isActive=%d "
                  "palmFlags=0x%llx thumbFlags=0x%llx indexFlags=0x%llx "
                  "palmValid=%s pinchJointsValid=%s directActive=%s",
                  handName[hand],
                  handResult,
                  locations.isActive,
                  static_cast<unsigned long long>(palm.locationFlags),
                  static_cast<unsigned long long>(thumbTip.locationFlags),
                  static_cast<unsigned long long>(indexTip.locationFlags),
                  palmValid ? "yes" : "no",
                  pinchJointsValid ? "yes" : "no",
                  directActive ? "yes" : "no"));
        }

        if (directActive) {
]==])

_p4u_replace_if_missing(
    "direct hand runtime diagnostics v4"
    "P4U: hand probe (%s)"
    "${_direct_hand_diag_old}"
    "${_direct_hand_diag_new}"
)

set(_hand_system_support_member_anchor [==[
  PFN_xrCreateHandTrackerEXT m_xrCreateHandTrackerEXT{nullptr};
]==])

set(_hand_system_support_member_replacement [==[
  bool m_handTrackingSystemSupported{false};
  PFN_xrCreateHandTrackerEXT m_xrCreateHandTrackerEXT{nullptr};
]==])

_p4u_replace_if_missing(
    "hand tracking system support state v5"
    "m_handTrackingSystemSupported{false}"
    "${_hand_system_support_member_anchor}"
    "${_hand_system_support_member_replacement}"
)

set(_hand_system_support_anchor [==[
    XrSystemGetInfo systemInfo{XR_TYPE_SYSTEM_GET_INFO};
    systemInfo.formFactor = m_options->Parsed.FormFactor;
    CHECK_XRCMD(xrGetSystem(m_instance, &systemInfo, &m_systemId));

    Log::Write(Log::Level::Verbose,
]==])

set(_hand_system_support_replacement [==[
    XrSystemGetInfo systemInfo{XR_TYPE_SYSTEM_GET_INFO};
    systemInfo.formFactor = m_options->Parsed.FormFactor;
    CHECK_XRCMD(xrGetSystem(m_instance, &systemInfo, &m_systemId));

    if (m_handTrackingSupported) {
      XrSystemHandTrackingPropertiesEXT handTrackingProperties{
          XR_TYPE_SYSTEM_HAND_TRACKING_PROPERTIES_EXT};
      XrSystemProperties systemProperties{
          XR_TYPE_SYSTEM_PROPERTIES, &handTrackingProperties};
      CHECK_XRCMD(xrGetSystemProperties(m_instance, m_systemId, &systemProperties));

      m_handTrackingSystemSupported =
          handTrackingProperties.supportsHandTracking == XR_TRUE;

      Log::Write(
          Log::Level::Info,
          Fmt("P4U: XR_EXT_hand_tracking system support=%s",
              m_handTrackingSystemSupported ? "yes" : "no"));
    }

    Log::Write(Log::Level::Verbose,
]==])

_p4u_replace_if_missing(
    "hand tracking system property probe v5"
    "P4U: XR_EXT_hand_tracking system support="
    "${_hand_system_support_anchor}"
    "${_hand_system_support_replacement}"
)

set(_direct_hand_pointer_origin_old [==[
        if (directActive) {
          resolvedPose = palm.pose;
          m_input.handActive[hand] = XR_TRUE;
]==])

set(_direct_hand_pointer_origin_new [==[
        if (directActive) {
          // P4U: the interaction pointer originates at the index fingertip, not the palm.
          // This matches the user's perceived pointing point and avoids a hand-center cursor.
          resolvedPose = indexTip.pose;
          m_input.handActive[hand] = XR_TRUE;
]==])

_p4u_replace_if_missing(
    "direct hand fingertip pointer origin v6"
    "P4U: the interaction pointer originates at the index fingertip"
    "${_direct_hand_pointer_origin_old}"
    "${_direct_hand_pointer_origin_new}"
)

set(_hud_quad_distance_old [==[
        quadL.pose = Math::Pose::Translation({0.0f, 0.f, -0.35f});
]==])

set(_hud_quad_distance_new [==[
        quadL.pose = Math::Pose::Translation({0.0f, 0.f, -0.50f});
]==])

_p4u_replace_if_missing(
    "native HUD quad distance v7"
    "quadL.pose = Math::Pose::Translation({0.0f, 0.f, -0.50f});"
    "${_hud_quad_distance_old}"
    "${_hud_quad_distance_new}"
)

set(_hud_quad_distance_right_old [==[
        quadR.pose = Math::Pose::Translation({0.0f, 0.f, -0.35f});
]==])

set(_hud_quad_distance_right_new [==[
        quadR.pose = Math::Pose::Translation({0.0f, 0.f, -0.50f});
]==])

_p4u_replace_if_missing(
    "native HUD quad right distance v7"
    "quadR.pose = Math::Pose::Translation({0.0f, 0.f, -0.50f});"
    "${_hud_quad_distance_right_old}"
    "${_hud_quad_distance_right_new}"
)

set(_input_arbitration_state_old [==[
  std::array<bool, Side::COUNT> m_p4uHandPinched{{false, false}};
  std::array<bool, Side::COUNT> m_p4uDirectHandWasActive{{false, false}};
  std::array<uint32_t, Side::COUNT> m_p4uHandProbeCounter{{0, 0}};

  XrEventDataBuffer m_eventDataBuffer;
]==])

set(_input_arbitration_state_new [==[
  std::array<bool, Side::COUNT> m_p4uHandPinched{{false, false}};
  std::array<bool, Side::COUNT> m_p4uDirectHandWasActive{{false, false}};
  std::array<uint32_t, Side::COUNT> m_p4uHandProbeCounter{{0, 0}};
  std::array<XrPosef, Side::COUNT> m_p4uPreviousControllerPose{};
  std::array<bool, Side::COUNT> m_p4uPreviousControllerPoseValid{{false, false}};
  std::array<uint32_t, Side::COUNT> m_p4uControllerRecentFrames{{0, 0}};
  std::array<int, Side::COUNT> m_p4uPointerSource{{0, 0}};

  XrEventDataBuffer m_eventDataBuffer;
]==])

_p4u_replace_if_missing(
    "input source arbitration state v8"
    "m_p4uControllerRecentFrames{{0, 0}}"
    "${_input_arbitration_state_old}"
    "${_input_arbitration_state_new}"
)

set(_input_arbitration_locals_old [==[
    for (auto hand : {Side::LEFT, Side::RIGHT}) {
      std::optional<XrPosef> resolvedPose;

      XrSpaceLocation spaceLocation{XR_TYPE_SPACE_LOCATION};
]==])

set(_input_arbitration_locals_new [==[
    for (auto hand : {Side::LEFT, Side::RIGHT}) {
      std::optional<XrPosef> resolvedPose;
      const InputState::ToggleStatus controllerToggle = m_input.handToggle[hand];
      bool controllerPoseValid = false;
      XrPosef controllerPose{};
      bool directHandActive = false;
      XrPosef directHandPose{};
      InputState::ToggleStatus directHandToggle = InputState::RELEASE;
      float directHandScale = 1.0f;

      XrSpaceLocation spaceLocation{XR_TYPE_SPACE_LOCATION};
]==])

_p4u_replace_if_missing(
    "input source arbitration locals v8"
    "const InputState::ToggleStatus controllerToggle = m_input.handToggle[hand]"
    "${_input_arbitration_locals_old}"
    "${_input_arbitration_locals_new}"
)

set(_input_arbitration_controller_old [==[
      if (XR_UNQUALIFIED_SUCCESS(res) &&
          (spaceLocation.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0 &&
          (spaceLocation.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT) != 0) {
        resolvedPose = spaceLocation.pose;
      }

      if (m_handTrackingSupported &&
]==])

set(_input_arbitration_controller_new [==[
      if (XR_UNQUALIFIED_SUCCESS(res) &&
          (spaceLocation.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0 &&
          (spaceLocation.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT) != 0) {
        controllerPose = spaceLocation.pose;
        controllerPoseValid = true;

        // P4U: A merely valid controller pose is not proof that the controller is the
        // user's active input source. Detect real movement and keep the controller sticky
        // briefly so hand tracking cannot steal the pointer while aiming.
        if (m_p4uPreviousControllerPoseValid[hand]) {
          const XrPosef& previous = m_p4uPreviousControllerPose[hand];
          const float dx = controllerPose.position.x - previous.position.x;
          const float dy = controllerPose.position.y - previous.position.y;
          const float dz = controllerPose.position.z - previous.position.z;
          const float positionDeltaSq = dx * dx + dy * dy + dz * dz;
          const float quaternionDot =
              std::abs(controllerPose.orientation.x * previous.orientation.x +
                       controllerPose.orientation.y * previous.orientation.y +
                       controllerPose.orientation.z * previous.orientation.z +
                       controllerPose.orientation.w * previous.orientation.w);
          const float angularDelta =
              2.0f * std::acos(std::min(1.0f, std::max(0.0f, quaternionDot)));

          if (positionDeltaSq >= 0.000036f || angularDelta >= 0.020f) {
            m_p4uControllerRecentFrames[hand] = 90;
          }
        }
        m_p4uPreviousControllerPose[hand] = controllerPose;
        m_p4uPreviousControllerPoseValid[hand] = true;
      } else {
        m_p4uPreviousControllerPoseValid[hand] = false;
        m_p4uControllerRecentFrames[hand] = 0;
      }

      // Trigger input is unambiguous user intent and immediately gives the controller
      // ownership, even if the controller was held perfectly still before the press.
      if (controllerToggle == InputState::PRESS_DOWN) {
        m_p4uControllerRecentFrames[hand] = 90;
      }

      if (m_handTrackingSupported &&
]==])

_p4u_replace_if_missing(
    "input source arbitration controller activity v8"
    "A merely valid controller pose is not proof"
    "${_input_arbitration_controller_old}"
    "${_input_arbitration_controller_new}"
)

set(_input_arbitration_hand_pose_old [==[
        if (directActive) {
          // P4U: the interaction pointer originates at the index fingertip, not the palm.
          // This matches the user's perceived pointing point and avoids a hand-center cursor.
          resolvedPose = indexTip.pose;
          m_input.handActive[hand] = XR_TRUE;
]==])

set(_input_arbitration_hand_pose_new [==[
        if (directActive) {
          // P4U: the interaction pointer originates at the index fingertip, not the palm.
          // This matches the user's perceived pointing point and avoids a hand-center cursor.
          directHandActive = true;
          directHandPose = indexTip.pose;
]==])

_p4u_replace_if_missing(
    "input source arbitration hand candidate v8"
    "directHandActive = true;"
    "${_input_arbitration_hand_pose_old}"
    "${_input_arbitration_hand_pose_new}"
)

set(_input_arbitration_hand_state_old [==[
          m_p4uHandPinched[hand] = pinched;
          m_input.handToggle[hand] =
              pinched ? InputState::PRESS_DOWN : InputState::RELEASE;

          const float pinchValue =
              std::min(1.0f, std::max(0.0f, (0.060f - pinchDistance) / 0.040f));
          m_input.handScale[hand] = 1.0f - 0.5f * pinchValue;
]==])

set(_input_arbitration_hand_state_new [==[
          m_p4uHandPinched[hand] = pinched;
          directHandToggle =
              pinched ? InputState::PRESS_DOWN : InputState::RELEASE;

          const float pinchValue =
              std::min(1.0f, std::max(0.0f, (0.060f - pinchDistance) / 0.040f));
          directHandScale = 1.0f - 0.5f * pinchValue;
]==])

_p4u_replace_if_missing(
    "input source arbitration hand state v8"
    "directHandToggle ="
    "${_input_arbitration_hand_state_old}"
    "${_input_arbitration_hand_state_new}"
)

set(_input_arbitration_apply_old [==[
      if (resolvedPose) {
        const XrPosef& pose = *resolvedPose;
]==])

set(_input_arbitration_apply_new [==[
      // P4U: arbitrate by recent *actual* use, not merely by tracking validity.
      // Controller movement/trigger wins immediately. Otherwise a valid direct hand takes
      // over. If no hand is available, a valid controller pose remains the fallback.
      const bool controllerRecent =
          controllerPoseValid && m_p4uControllerRecentFrames[hand] > 0;
      const bool useController =
          controllerPoseValid && (controllerRecent || !directHandActive);
      const int selectedSource = useController ? 1 : (directHandActive ? 2 : 0);

      if (useController) {
        resolvedPose = controllerPose;
        m_input.handActive[hand] = XR_TRUE;
        m_input.handToggle[hand] = controllerToggle;
      } else if (directHandActive) {
        resolvedPose = directHandPose;
        m_input.handActive[hand] = XR_TRUE;
        m_input.handToggle[hand] = directHandToggle;
        m_input.handScale[hand] = directHandScale;
      } else {
        resolvedPose.reset();
      }

      if (selectedSource != m_p4uPointerSource[hand]) {
        const char* handName[] = {"left", "right"};
        const char* sourceName[] = {"none", "controller", "hand"};
        Log::Write(
            Log::Level::Info,
            Fmt("P4U: pointer source (%s)=%s", handName[hand], sourceName[selectedSource]));
        m_p4uPointerSource[hand] = selectedSource;
      }

      if (m_p4uControllerRecentFrames[hand] > 0) {
        --m_p4uControllerRecentFrames[hand];
      }

      if (resolvedPose) {
        const XrPosef& pose = *resolvedPose;
]==])

_p4u_replace_if_missing(
    "input source arbitration apply v8"
    "P4U: arbitrate by recent *actual* use"
    "${_input_arbitration_apply_old}"
    "${_input_arbitration_apply_new}"
)

set(_toggle_type_controller_old [==[
      const InputState controllerToggle = m_input.handToggle[hand];
]==])

set(_toggle_type_controller_new [==[
      const InputState::ToggleStatus controllerToggle = m_input.handToggle[hand];
]==])

_p4u_replace_if_missing(
    "controller toggle enum type v9"
    "const InputState::ToggleStatus controllerToggle"
    "${_toggle_type_controller_old}"
    "${_toggle_type_controller_new}"
)

set(_toggle_type_hand_old [==[
      InputState directHandToggle = InputState::RELEASE;
]==])

set(_toggle_type_hand_new [==[
      InputState::ToggleStatus directHandToggle = InputState::RELEASE;
]==])

_p4u_replace_if_missing(
    "direct hand toggle enum type v9"
    "InputState::ToggleStatus directHandToggle"
    "${_toggle_type_hand_old}"
    "${_toggle_type_hand_new}"
)

set(_controller_beam_pose_state_old [==[
    std::array<XrVector3f*, 2> handDeltas{};
    std::array<std::optional<XrPosef>, 2> handPoses{};
    bool buttonPressed = false;
]==])

set(_controller_beam_pose_state_new [==[
    std::array<XrVector3f*, 2> handDeltas{};
    std::array<std::optional<XrPosef>, 2> handPoses{};
    std::array<std::optional<XrPosef>, 2> controllerBeamPoses{};
    bool buttonPressed = false;
]==])

_p4u_replace_if_missing(
    "controller beam pose state v10"
    "controllerBeamPoses{}"
    "${_controller_beam_pose_state_old}"
    "${_controller_beam_pose_state_new}"
)

set(_controller_beam_select_old [==[
      if (useController) {
        resolvedPose = controllerPose;
        m_input.handActive[hand] = XR_TRUE;
]==])

set(_controller_beam_select_new [==[
      if (useController) {
        resolvedPose = controllerPose;
        controllerBeamPoses[hand] = controllerPose;
        m_input.handActive[hand] = XR_TRUE;
]==])

_p4u_replace_if_missing(
    "controller beam selected source v10"
    "controllerBeamPoses[hand] = controllerPose"
    "${_controller_beam_select_old}"
    "${_controller_beam_select_new}"
)

set(_controller_beam_render_anchor [==[
      m_graphicsPlugin->RenderView(projectionLayerViews[i], swapchainImage, m_colorSwapchainFormat, cubes);
]==])

set(_controller_beam_render_replacement [==[
      m_graphicsPlugin->RenderView(projectionLayerViews[i], swapchainImage, m_colorSwapchainFormat, cubes);

      // P4U: PICO-style controller beam. Render only the controller source; direct
      // hand input keeps the fingertip reticle without a laser beam.
      for (auto hand : {Side::LEFT, Side::RIGHT}) {
        if (!controllerBeamPoses[hand]) {
          continue;
        }

        const XrPosef& beamPose = *controllerBeamPoses[hand];
        float beamLength = 0.80f;

        // Prefer ending the beam at the 50 cm head-locked HUD plane.
        if (!m_views.empty()) {
          XrPosef headPose = m_views[0].pose;
          if (m_views.size() > 1) {
            headPose.position.x =
                (m_views[0].pose.position.x + m_views[1].pose.position.x) * 0.5f;
            headPose.position.y =
                (m_views[0].pose.position.y + m_views[1].pose.position.y) * 0.5f;
            headPose.position.z =
                (m_views[0].pose.position.z + m_views[1].pose.position.z) * 0.5f;
          }

          const XrVector3f localForward{0.0f, 0.0f, -1.0f};
          XrVector3f rayDirection{};
          XrQuaternionf_RotateVector3f(
              &rayDirection, &beamPose.orientation, &localForward);

          const XrVector3f localHudOffset{0.0f, 0.0f, -0.50f};
          XrVector3f hudOffset{};
          XrQuaternionf_RotateVector3f(
              &hudOffset, &headPose.orientation, &localHudOffset);
          const XrVector3f hudPoint{
              headPose.position.x + hudOffset.x,
              headPose.position.y + hudOffset.y,
              headPose.position.z + hudOffset.z,
          };

          const XrVector3f localHudNormal{0.0f, 0.0f, 1.0f};
          XrVector3f hudNormal{};
          XrQuaternionf_RotateVector3f(
              &hudNormal, &headPose.orientation, &localHudNormal);

          const XrVector3f toHud{
              hudPoint.x - beamPose.position.x,
              hudPoint.y - beamPose.position.y,
              hudPoint.z - beamPose.position.z,
          };
          const float denominator = XrVector3f_Dot(&rayDirection, &hudNormal);
          if (std::abs(denominator) > 0.0001f) {
            const float distance =
                XrVector3f_Dot(&toHud, &hudNormal) / denominator;
            if (distance > 0.06f && distance < 2.0f) {
              beamLength = distance;
            }
          }
        }

        const float beamStart = 0.035f;
        const float beamEnd = std::max(beamStart + 0.04f, beamLength);
        const float halfWidth = 0.0016f;
        const float z0 = -beamStart;
        const float z1 = -beamEnd;
        const XrVector3f beamColor{0.82f, 0.88f, 0.96f};

        std::vector<Geometry::Vertex> beamVerts{
            {{-halfWidth, -halfWidth, z0}, beamColor},
            {{ halfWidth, -halfWidth, z0}, beamColor},
            {{ halfWidth,  halfWidth, z0}, beamColor},
            {{-halfWidth,  halfWidth, z0}, beamColor},
            {{-halfWidth, -halfWidth, z1}, beamColor},
            {{ halfWidth, -halfWidth, z1}, beamColor},
            {{ halfWidth,  halfWidth, z1}, beamColor},
            {{-halfWidth,  halfWidth, z1}, beamColor},
        };
        const std::vector<uint16_t> beamIndices{
            0, 1, 2, 0, 2, 3,
            4, 6, 5, 4, 7, 6,
            0, 4, 5, 0, 5, 1,
            1, 5, 6, 1, 6, 2,
            2, 6, 7, 2, 7, 3,
            3, 7, 4, 3, 4, 0,
        };

        m_graphicsPlugin->RenderUserMesh(
            projectionLayerViews[i],
            swapchainImage,
            m_colorSwapchainFormat,
            beamVerts.data(),
            static_cast<uint32_t>(beamVerts.size()),
            beamIndices.data(),
            static_cast<uint32_t>(beamIndices.size()),
            beamPose);
      }
]==])

_p4u_replace_if_missing(
    "PICO-style controller beam render v10"
    "P4U: PICO-style controller beam"
    "${_controller_beam_render_anchor}"
    "${_controller_beam_render_replacement}"
)

set(_pointer_beam_style_state_old [==[
    std::array<XrVector3f*, 2> handDeltas{};
    std::array<std::optional<XrPosef>, 2> handPoses{};
    std::array<std::optional<XrPosef>, 2> controllerBeamPoses{};
    bool buttonPressed = false;
]==])

set(_pointer_beam_style_state_new [==[
    std::array<XrVector3f*, 2> handDeltas{};
    std::array<std::optional<XrPosef>, 2> handPoses{};
    std::array<std::optional<XrPosef>, 2> controllerBeamPoses{};
    std::array<bool, 2> pointerBeamIsHand{{false, false}};
    bool buttonPressed = false;
]==])

_p4u_replace_if_missing(
    "pointer beam source style state v11"
    "pointerBeamIsHand{{false, false}}"
    "${_pointer_beam_style_state_old}"
    "${_pointer_beam_style_state_new}"
)

set(_pointer_beam_pose_old [==[
      if (resolvedPose) {
        const XrPosef& pose = *resolvedPose;
        float scale = 0.1f * m_input.handScale[hand];
]==])

set(_pointer_beam_pose_new [==[
      if (resolvedPose) {
        const XrPosef& pose = *resolvedPose;

        // P4U v11: visualize the pointer that is actually delivered to the product,
        // not only the provisional controller candidate. This guarantees a beam for
        // controllers as well as the direct-hand fallback.
        controllerBeamPoses[hand] = pose;
        pointerBeamIsHand[hand] =
            directHandActive && m_p4uControllerRecentFrames[hand] == 0;

        float scale = 0.1f * m_input.handScale[hand];
]==])

_p4u_replace_if_missing(
    "beam follows resolved pointer pose v11"
    "P4U v11: visualize the pointer that is actually delivered to the product"
    "${_pointer_beam_pose_old}"
    "${_pointer_beam_pose_new}"
)

set(_pointer_beam_geometry_old [==[
        const float beamStart = 0.035f;
        const float beamEnd = std::max(beamStart + 0.04f, beamLength);
        const float halfWidth = 0.0016f;
        const float z0 = -beamStart;
        const float z1 = -beamEnd;
        const XrVector3f beamColor{0.82f, 0.88f, 0.96f};

        std::vector<Geometry::Vertex> beamVerts{
            {{-halfWidth, -halfWidth, z0}, beamColor},
            {{ halfWidth, -halfWidth, z0}, beamColor},
            {{ halfWidth,  halfWidth, z0}, beamColor},
            {{-halfWidth,  halfWidth, z0}, beamColor},
            {{-halfWidth, -halfWidth, z1}, beamColor},
            {{ halfWidth, -halfWidth, z1}, beamColor},
            {{ halfWidth,  halfWidth, z1}, beamColor},
            {{-halfWidth,  halfWidth, z1}, beamColor},
        };
        const std::vector<uint16_t> beamIndices{
            0, 1, 2, 0, 2, 3,
            4, 6, 5, 4, 7, 6,
            0, 4, 5, 0, 5, 1,
            1, 5, 6, 1, 6, 2,
            2, 6, 7, 2, 7, 3,
            3, 7, 4, 3, 4, 0,
        };

        m_graphicsPlugin->RenderUserMesh(
            projectionLayerViews[i],
            swapchainImage,
            m_colorSwapchainFormat,
            beamVerts.data(),
            static_cast<uint32_t>(beamVerts.size()),
            beamIndices.data(),
            static_cast<uint32_t>(beamIndices.size()),
            beamPose);
]==])

set(_pointer_beam_geometry_new [==[
        const float beamStart = pointerBeamIsHand[hand] ? 0.004f : 0.035f;
        const float beamEnd = std::max(beamStart + 0.04f, beamLength);

        // P4U: rounded tapered pointer beam v11.
        // Geometry::Vertex has RGB but no alpha, so the hand beam fades visually by
        // combining a shrinking radius with progressively dimmer vertex colors.
        constexpr int kBeamSides = 10;
        const int beamSegments = pointerBeamIsHand[hand] ? 10 : 5;
        const float startRadius = pointerBeamIsHand[hand] ? 0.0026f : 0.0018f;
        const float endRadius = pointerBeamIsHand[hand] ? 0.00015f : 0.0010f;

        std::vector<Geometry::Vertex> beamVerts;
        std::vector<uint16_t> beamIndices;
        beamVerts.reserve(static_cast<size_t>(beamSegments + 1) * kBeamSides);
        beamIndices.reserve(static_cast<size_t>(beamSegments) * kBeamSides * 6);

        for (int segment = 0; segment <= beamSegments; ++segment) {
          const float t =
              static_cast<float>(segment) / static_cast<float>(beamSegments);
          const float z = -(beamStart + (beamEnd - beamStart) * t);

          float radius =
              startRadius + (endRadius - startRadius) * t;
          float intensity = 1.0f;
          if (pointerBeamIsHand[hand]) {
            // Smooth fade towards the target: brightest at the fingertip, nearly gone
            // at the far end. Radius taper reinforces the fade without opaque dark caps.
            const float fade = 1.0f - t;
            intensity = 0.18f + 0.82f * fade * fade;
          } else {
            intensity = 0.72f + 0.28f * (1.0f - t);
          }

          const XrVector3f color{
              0.82f * intensity,
              0.88f * intensity,
              0.96f * intensity,
          };

          for (int sideIndex = 0; sideIndex < kBeamSides; ++sideIndex) {
            const float angle =
                (2.0f * MATH_PI * static_cast<float>(sideIndex)) /
                static_cast<float>(kBeamSides);
            beamVerts.push_back({
                {radius * std::cos(angle), radius * std::sin(angle), z},
                color,
            });
          }
        }

        for (int segment = 0; segment < beamSegments; ++segment) {
          const int ring0 = segment * kBeamSides;
          const int ring1 = (segment + 1) * kBeamSides;
          for (int sideIndex = 0; sideIndex < kBeamSides; ++sideIndex) {
            const int next = (sideIndex + 1) % kBeamSides;
            const uint16_t a = static_cast<uint16_t>(ring0 + sideIndex);
            const uint16_t b = static_cast<uint16_t>(ring0 + next);
            const uint16_t c = static_cast<uint16_t>(ring1 + next);
            const uint16_t d = static_cast<uint16_t>(ring1 + sideIndex);
            beamIndices.push_back(a);
            beamIndices.push_back(b);
            beamIndices.push_back(c);
            beamIndices.push_back(a);
            beamIndices.push_back(c);
            beamIndices.push_back(d);
          }
        }

        m_graphicsPlugin->RenderUserMesh(
            projectionLayerViews[i],
            swapchainImage,
            m_colorSwapchainFormat,
            beamVerts.data(),
            static_cast<uint32_t>(beamVerts.size()),
            beamIndices.data(),
            static_cast<uint32_t>(beamIndices.size()),
            beamPose);
]==])

_p4u_replace_if_missing(
    "rounded tapered pointer beam v11"
    "P4U: rounded tapered pointer beam v11"
    "${_pointer_beam_geometry_old}"
    "${_pointer_beam_geometry_new}"
)

set(_hand_skeleton_state_old [==[
    std::array<std::optional<XrPosef>, 2> controllerBeamPoses{};
    std::array<bool, 2> pointerBeamIsHand{{false, false}};
    bool buttonPressed = false;
]==])

set(_hand_skeleton_state_new [==[
    std::array<std::optional<XrPosef>, 2> controllerBeamPoses{};
    std::array<bool, 2> pointerBeamIsHand{{false, false}};
    std::array<bool, 2> handSkeletonVisible{{false, false}};
    bool buttonPressed = false;
]==])

_p4u_replace_if_missing(
    "hand skeleton visibility state v12"
    "handSkeletonVisible{{false, false}}"
    "${_hand_skeleton_state_old}"
    "${_hand_skeleton_state_new}"
)

set(_hand_skeleton_selection_old [==[
      const int selectedSource = useController ? 1 : (directHandActive ? 2 : 0);

      if (useController) {
]==])

set(_hand_skeleton_selection_new [==[
      const int selectedSource = useController ? 1 : (directHandActive ? 2 : 0);
      handSkeletonVisible[hand] = selectedSource == 2;

      if (useController) {
]==])

_p4u_replace_if_missing(
    "hand skeleton follows selected source v12"
    "handSkeletonVisible[hand] = selectedSource == 2"
    "${_hand_skeleton_selection_old}"
    "${_hand_skeleton_selection_new}"
)

set(_hand_skeleton_build_anchor [==[
    for (const auto& handPtr : handDeltas) {
      delete handPtr;
    }

    // Render view to the appropriate part of the swapchain image.
]==])

set(_hand_skeleton_build_replacement [==[
    for (const auto& handPtr : handDeltas) {
      delete handPtr;
    }

    // P4U: build a lightweight procedural skeleton from all 26 XR_EXT_hand_tracking
    // joints. The tracking layer remains independent from presentation, so a skinned
    // hand model can replace this visualization later without changing input semantics.
    std::vector<Geometry::Vertex> handSkeletonVerts;
    std::vector<uint16_t> handSkeletonIndices;

    constexpr int kSkeletonTubeSides = 6;
    const XrVector3f skeletonColor{0.72f, 0.82f, 0.94f};
    const XrVector3f fingertipColor{0.90f, 0.94f, 1.00f};

    const auto jointPositionValid = [&](int hand, XrHandJointEXT joint) {
      return (m_p4uHandJoints[hand][joint].locationFlags &
              XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0;
    };

    const auto appendJointMarker =
        [&](const XrVector3f& center, float radius, const XrVector3f& color) {
          if (handSkeletonVerts.size() + 6 >= 65535) return;

          const uint16_t base =
              static_cast<uint16_t>(handSkeletonVerts.size());
          handSkeletonVerts.push_back({{center.x + radius, center.y, center.z}, color});
          handSkeletonVerts.push_back({{center.x - radius, center.y, center.z}, color});
          handSkeletonVerts.push_back({{center.x, center.y + radius, center.z}, color});
          handSkeletonVerts.push_back({{center.x, center.y - radius, center.z}, color});
          handSkeletonVerts.push_back({{center.x, center.y, center.z + radius}, color});
          handSkeletonVerts.push_back({{center.x, center.y, center.z - radius}, color});

          const uint16_t faces[][3] = {
              {0, 2, 4}, {2, 1, 4}, {1, 3, 4}, {3, 0, 4},
              {2, 0, 5}, {1, 2, 5}, {3, 1, 5}, {0, 3, 5},
          };
          for (const auto& face : faces) {
            handSkeletonIndices.push_back(base + face[0]);
            handSkeletonIndices.push_back(base + face[1]);
            handSkeletonIndices.push_back(base + face[2]);
          }
        };

    const auto appendBone =
        [&](const XrVector3f& a, const XrVector3f& b, float radius,
            const XrVector3f& color) {
          XrVector3f direction{b.x - a.x, b.y - a.y, b.z - a.z};
          const float length = XrVector3f_Length(&direction);
          if (length < 0.001f ||
              handSkeletonVerts.size() + kSkeletonTubeSides * 2 >= 65535) {
            return;
          }
          XrVector3f_Normalize(&direction);

          XrVector3f reference =
              std::abs(direction.y) < 0.92f
                  ? XrVector3f{0.0f, 1.0f, 0.0f}
                  : XrVector3f{1.0f, 0.0f, 0.0f};
          XrVector3f axisU{};
          XrVector3f_Cross(&axisU, &direction, &reference);
          XrVector3f_Normalize(&axisU);
          XrVector3f axisV{};
          XrVector3f_Cross(&axisV, &direction, &axisU);
          XrVector3f_Normalize(&axisV);

          const uint16_t base =
              static_cast<uint16_t>(handSkeletonVerts.size());
          for (int ring = 0; ring < 2; ++ring) {
            const XrVector3f& center = ring == 0 ? a : b;
            for (int sideIndex = 0; sideIndex < kSkeletonTubeSides; ++sideIndex) {
              const float angle =
                  (2.0f * MATH_PI * static_cast<float>(sideIndex)) /
                  static_cast<float>(kSkeletonTubeSides);
              const float cs = std::cos(angle);
              const float sn = std::sin(angle);
              handSkeletonVerts.push_back({
                  {
                      center.x + radius * (axisU.x * cs + axisV.x * sn),
                      center.y + radius * (axisU.y * cs + axisV.y * sn),
                      center.z + radius * (axisU.z * cs + axisV.z * sn),
                  },
                  color,
              });
            }
          }

          for (int sideIndex = 0; sideIndex < kSkeletonTubeSides; ++sideIndex) {
            const int next = (sideIndex + 1) % kSkeletonTubeSides;
            const uint16_t a0 = base + static_cast<uint16_t>(sideIndex);
            const uint16_t a1 = base + static_cast<uint16_t>(next);
            const uint16_t b1 =
                base + static_cast<uint16_t>(kSkeletonTubeSides + next);
            const uint16_t b0 =
                base + static_cast<uint16_t>(kSkeletonTubeSides + sideIndex);
            handSkeletonIndices.push_back(a0);
            handSkeletonIndices.push_back(a1);
            handSkeletonIndices.push_back(b1);
            handSkeletonIndices.push_back(a0);
            handSkeletonIndices.push_back(b1);
            handSkeletonIndices.push_back(b0);
          }
        };

    const std::array<std::pair<XrHandJointEXT, XrHandJointEXT>, 25>
        skeletonBones{{
            {XR_HAND_JOINT_WRIST_EXT, XR_HAND_JOINT_PALM_EXT},
            {XR_HAND_JOINT_WRIST_EXT, XR_HAND_JOINT_THUMB_METACARPAL_EXT},
            {XR_HAND_JOINT_THUMB_METACARPAL_EXT, XR_HAND_JOINT_THUMB_PROXIMAL_EXT},
            {XR_HAND_JOINT_THUMB_PROXIMAL_EXT, XR_HAND_JOINT_THUMB_DISTAL_EXT},
            {XR_HAND_JOINT_THUMB_DISTAL_EXT, XR_HAND_JOINT_THUMB_TIP_EXT},

            {XR_HAND_JOINT_PALM_EXT, XR_HAND_JOINT_INDEX_METACARPAL_EXT},
            {XR_HAND_JOINT_INDEX_METACARPAL_EXT, XR_HAND_JOINT_INDEX_PROXIMAL_EXT},
            {XR_HAND_JOINT_INDEX_PROXIMAL_EXT, XR_HAND_JOINT_INDEX_INTERMEDIATE_EXT},
            {XR_HAND_JOINT_INDEX_INTERMEDIATE_EXT, XR_HAND_JOINT_INDEX_DISTAL_EXT},
            {XR_HAND_JOINT_INDEX_DISTAL_EXT, XR_HAND_JOINT_INDEX_TIP_EXT},

            {XR_HAND_JOINT_PALM_EXT, XR_HAND_JOINT_MIDDLE_METACARPAL_EXT},
            {XR_HAND_JOINT_MIDDLE_METACARPAL_EXT, XR_HAND_JOINT_MIDDLE_PROXIMAL_EXT},
            {XR_HAND_JOINT_MIDDLE_PROXIMAL_EXT, XR_HAND_JOINT_MIDDLE_INTERMEDIATE_EXT},
            {XR_HAND_JOINT_MIDDLE_INTERMEDIATE_EXT, XR_HAND_JOINT_MIDDLE_DISTAL_EXT},
            {XR_HAND_JOINT_MIDDLE_DISTAL_EXT, XR_HAND_JOINT_MIDDLE_TIP_EXT},

            {XR_HAND_JOINT_PALM_EXT, XR_HAND_JOINT_RING_METACARPAL_EXT},
            {XR_HAND_JOINT_RING_METACARPAL_EXT, XR_HAND_JOINT_RING_PROXIMAL_EXT},
            {XR_HAND_JOINT_RING_PROXIMAL_EXT, XR_HAND_JOINT_RING_INTERMEDIATE_EXT},
            {XR_HAND_JOINT_RING_INTERMEDIATE_EXT, XR_HAND_JOINT_RING_DISTAL_EXT},
            {XR_HAND_JOINT_RING_DISTAL_EXT, XR_HAND_JOINT_RING_TIP_EXT},

            {XR_HAND_JOINT_PALM_EXT, XR_HAND_JOINT_LITTLE_METACARPAL_EXT},
            {XR_HAND_JOINT_LITTLE_METACARPAL_EXT, XR_HAND_JOINT_LITTLE_PROXIMAL_EXT},
            {XR_HAND_JOINT_LITTLE_PROXIMAL_EXT, XR_HAND_JOINT_LITTLE_INTERMEDIATE_EXT},
            {XR_HAND_JOINT_LITTLE_INTERMEDIATE_EXT, XR_HAND_JOINT_LITTLE_DISTAL_EXT},
            {XR_HAND_JOINT_LITTLE_DISTAL_EXT, XR_HAND_JOINT_LITTLE_TIP_EXT},
        }};

    const std::array<XrHandJointEXT, 5> fingertipJoints{{
        XR_HAND_JOINT_THUMB_TIP_EXT,
        XR_HAND_JOINT_INDEX_TIP_EXT,
        XR_HAND_JOINT_MIDDLE_TIP_EXT,
        XR_HAND_JOINT_RING_TIP_EXT,
        XR_HAND_JOINT_LITTLE_TIP_EXT,
    }};

    const auto isFingertip = [&](XrHandJointEXT joint) {
      return std::find(fingertipJoints.begin(), fingertipJoints.end(), joint) !=
             fingertipJoints.end();
    };

    for (auto hand : {Side::LEFT, Side::RIGHT}) {
      if (!handSkeletonVisible[hand]) continue;

      for (const auto& [fromJoint, toJoint] : skeletonBones) {
        if (!jointPositionValid(hand, fromJoint) ||
            !jointPositionValid(hand, toJoint)) {
          continue;
        }
        appendBone(
            m_p4uHandJoints[hand][fromJoint].pose.position,
            m_p4uHandJoints[hand][toJoint].pose.position,
            0.00145f,
            skeletonColor);
      }

      for (int jointIndex = 0; jointIndex < XR_HAND_JOINT_COUNT_EXT; ++jointIndex) {
        const auto joint = static_cast<XrHandJointEXT>(jointIndex);
        if (!jointPositionValid(hand, joint)) continue;

        const float trackedRadius = m_p4uHandJoints[hand][joint].radius;
        const float markerRadius =
            std::min(0.0032f, std::max(0.0018f, trackedRadius * 0.30f));
        appendJointMarker(
            m_p4uHandJoints[hand][joint].pose.position,
            isFingertip(joint) ? markerRadius * 1.18f : markerRadius,
            isFingertip(joint) ? fingertipColor : skeletonColor);
      }
    }

    // Render view to the appropriate part of the swapchain image.
]==])

_p4u_replace_if_missing(
    "procedural 26-joint hand skeleton v12"
    "P4U: build a lightweight procedural skeleton from all 26"
    "${_hand_skeleton_build_anchor}"
    "${_hand_skeleton_build_replacement}"
)

set(_hand_skeleton_render_anchor [==[
      m_graphicsPlugin->RenderView(projectionLayerViews[i], swapchainImage, m_colorSwapchainFormat, cubes);
]==])

set(_hand_skeleton_render_replacement [==[
      m_graphicsPlugin->RenderView(projectionLayerViews[i], swapchainImage, m_colorSwapchainFormat, cubes);

      if (!handSkeletonVerts.empty() && !handSkeletonIndices.empty()) {
        XrPosef skeletonWorldPose{};
        skeletonWorldPose.orientation.w = 1.0f;
        m_graphicsPlugin->RenderUserMesh(
            projectionLayerViews[i],
            swapchainImage,
            m_colorSwapchainFormat,
            handSkeletonVerts.data(),
            static_cast<uint32_t>(handSkeletonVerts.size()),
            handSkeletonIndices.data(),
            static_cast<uint32_t>(handSkeletonIndices.size()),
            skeletonWorldPose);
      }
]==])

_p4u_replace_if_missing(
    "render procedural hand skeleton v12"
    "if (!handSkeletonVerts.empty() && !handSkeletonIndices.empty())"
    "${_hand_skeleton_render_anchor}"
    "${_hand_skeleton_render_replacement}"
)

file(WRITE "${_p4u_openxr_program}" "${_p4u_openxr_source}")
message(STATUS "Applied PICO 4 Ultra OpenXR input patch")
