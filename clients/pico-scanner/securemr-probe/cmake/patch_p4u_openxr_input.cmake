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
          // P4U: keep the hand control point near the index fingertip, but shift it
          // slightly toward the thumb so it sits closer to the natural pinch/control area.
          directHandActive = true;
          directHandPose = indexTip.pose;
          constexpr float kHandControlPointTowardThumb = 0.20f;
          directHandPose.position.x +=
              (thumbTip.pose.position.x - indexTip.pose.position.x) *
              kHandControlPointTowardThumb;
          directHandPose.position.y +=
              (thumbTip.pose.position.y - indexTip.pose.position.y) *
              kHandControlPointTowardThumb;
          directHandPose.position.z +=
              (thumbTip.pose.position.z - indexTip.pose.position.z) *
              kHandControlPointTowardThumb;

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
        if (renderControllerCubes && useController) {
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

_p4u_replace_if_missing_or_superseded(
    "direct hand activity semantics v3"
    "PICO's native OpenXR sample does not gate joint usability"
    "P4U v18: direct interaction needs the index aim pose"
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

_p4u_replace_if_missing_or_superseded(
    "direct hand fingertip pointer origin v6"
    "P4U: the interaction pointer originates at the index fingertip"
    "directHandActive = true;"
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

_p4u_replace_if_missing_or_superseded(
    "input source arbitration locals v8"
    "const InputState::ToggleStatus controllerToggle = m_input.handToggle[hand]"
    "controllerGripPoseValid = false"
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
        if (!controllerPointerSelected[hand] || !controllerBeamPoses[hand]) {
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

        // P4U: beam ownership follows the explicit arbitration result. The controller
        // pose was captured above only when useController=true; hands never populate it.
        pointerBeamIsHand[hand] = false;

        float scale = 0.1f * m_input.handScale[hand];
]==])

_p4u_replace_if_missing_or_superseded(
    "beam follows resolved pointer pose v11"
    "P4U v11: visualize the pointer that is actually delivered to the product"
    "beam ownership follows the explicit arbitration result"
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
        const float startRadius = pointerBeamIsHand[hand] ? 0.0026f : 0.0028f;
        const float endRadius = pointerBeamIsHand[hand] ? 0.00015f : 0.0014f;

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
    std::array<bool, 2> controllerPointerSelected{{false, false}};
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
      controllerPointerSelected[hand] = useController;

      // P4U: hand visualization follows tracking presence, not pointer ownership.
      // Source arbitration may keep a controller sticky for interaction while the real
      // hand is still fully tracked; hiding the skeleton in that state caused flicker.
      handSkeletonVisible[hand] = directHandActive;

      if (useController) {
]==])

_p4u_replace_if_missing_or_superseded(
    "hand skeleton follows selected source v12"
    "handSkeletonVisible[hand] = selectedSource == 2"
    "handSkeletonVisible[hand] = directHandActive"
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

set(_skeleton_hand_index_type_old [==[
    const auto jointPositionValid = [&](Side hand, XrHandJointEXT joint) {
]==])

set(_skeleton_hand_index_type_new [==[
    const auto jointPositionValid = [&](int hand, XrHandJointEXT joint) {
]==])

_p4u_replace_if_missing(
    "skeleton hand index type v13"
    "const auto jointPositionValid = [&](int hand, XrHandJointEXT joint)"
    "${_skeleton_hand_index_type_old}"
    "${_skeleton_hand_index_type_new}"
)

set(_skeleton_tracking_visibility_old [==[
      handSkeletonVisible[hand] = selectedSource == 2;
]==])

set(_skeleton_tracking_visibility_new [==[
      // P4U: hand visualization follows tracking presence, not pointer ownership.
      // Source arbitration may keep a controller sticky for interaction while the real
      // hand is still fully tracked; hiding the skeleton in that state caused flicker.
      handSkeletonVisible[hand] = directHandActive;
]==])

_p4u_replace_if_missing_or_superseded(
    "hand skeleton tracking visibility v14"
    "handSkeletonVisible[hand] = directHandActive"
    "handSkeletonVisible[hand] = trackedJointCount >= 6"
    "${_skeleton_tracking_visibility_old}"
    "${_skeleton_tracking_visibility_new}"
)

set(_hand_control_point_thumb_shift_old [==[
          directHandActive = true;
          directHandPose = indexTip.pose;

          const float dx = thumbTip.pose.position.x - indexTip.pose.position.x;
]==])

set(_hand_control_point_thumb_shift_new [==[
          directHandActive = true;
          directHandPose = indexTip.pose;
          constexpr float kHandControlPointTowardThumb = 0.20f;
          directHandPose.position.x +=
              (thumbTip.pose.position.x - indexTip.pose.position.x) *
              kHandControlPointTowardThumb;
          directHandPose.position.y +=
              (thumbTip.pose.position.y - indexTip.pose.position.y) *
              kHandControlPointTowardThumb;
          directHandPose.position.z +=
              (thumbTip.pose.position.z - indexTip.pose.position.z) *
              kHandControlPointTowardThumb;

          const float dx = thumbTip.pose.position.x - indexTip.pose.position.x;
]==])

_p4u_replace_if_missing_or_superseded(
    "hand control point toward thumb v15"
    "kHandControlPointTowardThumb = 0.20f"
    "kHandControlPointOffsetMeters = 0.012f"
    "${_hand_control_point_thumb_shift_old}"
    "${_hand_control_point_thumb_shift_new}"
)

set(_hand_beam_disable_old [==[
        if (!controllerBeamPoses[hand]) {
          continue;
        }

        const XrPosef& beamPose = *controllerBeamPoses[hand];
]==])

set(_hand_beam_disable_new [==[
        if (!controllerBeamPoses[hand]) {
          continue;
        }

        // P4U: hands use the tracked skeleton plus HUD control point only.
        // Keep the laser-style beam exclusively for physical controllers.
        if (pointerBeamIsHand[hand]) {
          continue;
        }

        const XrPosef& beamPose = *controllerBeamPoses[hand];
]==])

_p4u_replace_if_missing_or_superseded(
    "disable hand pointer beam v15"
    "Keep the laser-style beam exclusively for physical controllers"
    "!controllerPointerSelected[hand] || !controllerBeamPoses[hand]"
    "${_hand_beam_disable_old}"
    "${_hand_beam_disable_new}"
)

set(_controller_visual_selected_state_old [==[
    std::array<bool, 2> pointerBeamIsHand{{false, false}};
    std::array<bool, 2> handSkeletonVisible{{false, false}};
]==])

set(_controller_visual_selected_state_new [==[
    std::array<bool, 2> pointerBeamIsHand{{false, false}};
    std::array<bool, 2> controllerPointerSelected{{false, false}};
    std::array<bool, 2> handSkeletonVisible{{false, false}};
]==])

_p4u_replace_if_missing(
    "controller selected render state v16"
    "controllerPointerSelected{{false, false}}"
    "${_controller_visual_selected_state_old}"
    "${_controller_visual_selected_state_new}"
)

set(_controller_visual_selection_old [==[
      const int selectedSource = useController ? 1 : (directHandActive ? 2 : 0);

      // P4U: hand visualization follows tracking presence, not pointer ownership.
]==])

set(_controller_visual_selection_new [==[
      const int selectedSource = useController ? 1 : (directHandActive ? 2 : 0);
      controllerPointerSelected[hand] = useController;

      // P4U: hand visualization follows tracking presence, not pointer ownership.
]==])

_p4u_replace_if_missing(
    "controller selected render source v16"
    "controllerPointerSelected[hand] = useController"
    "${_controller_visual_selection_old}"
    "${_controller_visual_selection_new}"
)

set(_controller_visual_cube_old [==[
        if (renderControllerCubes) {
          cubes.push_back(Cube{pose, {scale, scale, scale}});
        }
]==])

set(_controller_visual_cube_new [==[
        if (renderControllerCubes && useController) {
          cubes.push_back(Cube{pose, {scale, scale, scale}});
        }
]==])

_p4u_replace_if_missing_or_superseded(
    "controller proxy selected source v16"
    "if (renderControllerCubes && useController)"
    "P4U v17 diagnostic controller proxy"
    "${_controller_visual_cube_old}"
    "${_controller_visual_cube_new}"
)

set(_controller_beam_resolved_old [==[
        // P4U v11: visualize the pointer that is actually delivered to the product,
        // not only the provisional controller candidate. This guarantees a beam for
        // controllers as well as the direct-hand fallback.
        controllerBeamPoses[hand] = pose;
        pointerBeamIsHand[hand] =
            directHandActive && m_p4uControllerRecentFrames[hand] == 0;
]==])

set(_controller_beam_resolved_new [==[
        // P4U: beam ownership follows the explicit arbitration result. The controller
        // pose was captured above only when useController=true; hands never populate it.
        pointerBeamIsHand[hand] = false;
]==])

_p4u_replace_if_missing(
    "controller explicit beam ownership v16"
    "beam ownership follows the explicit arbitration result"
    "${_controller_beam_resolved_old}"
    "${_controller_beam_resolved_new}"
)

set(_controller_beam_guard_old [==[
        if (!controllerBeamPoses[hand]) {
          continue;
        }

        // P4U: hands use the tracked skeleton plus HUD control point only.
        // Keep the laser-style beam exclusively for physical controllers.
        if (pointerBeamIsHand[hand]) {
          continue;
        }

        const XrPosef& beamPose = *controllerBeamPoses[hand];
]==])

set(_controller_beam_guard_new [==[
        if (!controllerPointerSelected[hand] || !controllerBeamPoses[hand]) {
          continue;
        }

        const XrPosef& beamPose = *controllerBeamPoses[hand];
]==])

_p4u_replace_if_missing(
    "controller explicit beam guard v16"
    "!controllerPointerSelected[hand] || !controllerBeamPoses[hand]"
    "${_controller_beam_guard_old}"
    "${_controller_beam_guard_new}"
)

set(_controller_beam_radius_old [==[
        const float startRadius = pointerBeamIsHand[hand] ? 0.0026f : 0.0018f;
        const float endRadius = pointerBeamIsHand[hand] ? 0.00015f : 0.0010f;
]==])

set(_controller_beam_radius_new [==[
        const float startRadius = pointerBeamIsHand[hand] ? 0.0026f : 0.0028f;
        const float endRadius = pointerBeamIsHand[hand] ? 0.00015f : 0.0014f;
]==])

_p4u_replace_if_missing(
    "controller diagnostic beam width v16"
    "pointerBeamIsHand[hand] ? 0.0026f : 0.0028f"
    "${_controller_beam_radius_old}"
    "${_controller_beam_radius_new}"
)


# P4U v17: separate physical controller input from hand interaction. Earlier revisions
# shared grabAction/poseAction between XR_EXT_hand_interaction and PICO controllers, which
# made a valid pose ambiguous and allowed controller proxy geometry to appear on fingers.

set(_controller_actions_state_anchor [==[
  std::array<int, Side::COUNT> m_p4uPointerSource{{0, 0}};

  XrEventDataBuffer m_eventDataBuffer;
]==])

set(_controller_actions_state_replacement [==[
  std::array<int, Side::COUNT> m_p4uPointerSource{{0, 0}};

  // P4U v17: dedicated physical-controller state. Aim drives HUD/ray, grip drives the
  // controller proxy, and trigger is independent from hand pinch.
  XrAction m_p4uControllerAimAction{XR_NULL_HANDLE};
  XrAction m_p4uControllerGripAction{XR_NULL_HANDLE};
  XrAction m_p4uControllerTriggerAction{XR_NULL_HANDLE};
  std::array<XrSpace, Side::COUNT> m_p4uControllerAimSpace{{XR_NULL_HANDLE, XR_NULL_HANDLE}};
  std::array<XrSpace, Side::COUNT> m_p4uControllerGripSpace{{XR_NULL_HANDLE, XR_NULL_HANDLE}};
  std::array<XrBool32, Side::COUNT> m_p4uControllerAimActive{{XR_FALSE, XR_FALSE}};
  std::array<float, Side::COUNT> m_p4uControllerTriggerValue{{0.0f, 0.0f}};

  XrEventDataBuffer m_eventDataBuffer;
]==])

_p4u_replace_if_missing(
    "dedicated controller state v17"
    "m_p4uControllerAimAction{XR_NULL_HANDLE}"
    "${_controller_actions_state_anchor}"
    "${_controller_actions_state_replacement}"
)

set(_controller_actions_create_anchor [==[
    std::array<XrPath, Side::COUNT> selectPath;
]==])

set(_controller_actions_create_replacement [==[
    // P4U v17: create controller-only actions so hand interaction can no longer resolve
    // through the same pose/grab action as the physical PICO controllers.
    {
      XrActionCreateInfo controllerActionInfo{XR_TYPE_ACTION_CREATE_INFO};
      controllerActionInfo.countSubactionPaths =
          static_cast<uint32_t>(m_input.handSubactionPath.size());
      controllerActionInfo.subactionPaths = m_input.handSubactionPath.data();

      controllerActionInfo.actionType = XR_ACTION_TYPE_POSE_INPUT;
      strcpy_s(controllerActionInfo.actionName, "p4u_controller_aim");
      strcpy_s(controllerActionInfo.localizedActionName, "P4U Controller Aim");
      CHECK_XRCMD(xrCreateAction(
          m_input.actionSet, &controllerActionInfo, &m_p4uControllerAimAction));

      controllerActionInfo.actionType = XR_ACTION_TYPE_POSE_INPUT;
      strcpy_s(controllerActionInfo.actionName, "p4u_controller_grip");
      strcpy_s(controllerActionInfo.localizedActionName, "P4U Controller Grip");
      CHECK_XRCMD(xrCreateAction(
          m_input.actionSet, &controllerActionInfo, &m_p4uControllerGripAction));

      controllerActionInfo.actionType = XR_ACTION_TYPE_FLOAT_INPUT;
      strcpy_s(controllerActionInfo.actionName, "p4u_controller_trigger");
      strcpy_s(controllerActionInfo.localizedActionName, "P4U Controller Trigger");
      CHECK_XRCMD(xrCreateAction(
          m_input.actionSet, &controllerActionInfo, &m_p4uControllerTriggerAction));
    }

    std::array<XrPath, Side::COUNT> selectPath;
]==])

_p4u_replace_if_missing(
    "dedicated controller actions v17"
    "P4U v17: create controller-only actions"
    "${_controller_actions_create_anchor}"
    "${_controller_actions_create_replacement}"
)

set(_controller_bindings_old [==[
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
]==])

set(_controller_bindings_new [==[
      XrPath leftAimPosePath;
      XrPath rightAimPosePath;
      XrPath leftGripPosePath;
      XrPath rightGripPosePath;

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
      CHECK_XRCMD(xrStringToPath(
          m_instance,
          "/user/hand/left/input/grip/pose",
          &leftGripPosePath));
      CHECK_XRCMD(xrStringToPath(
          m_instance,
          "/user/hand/right/input/grip/pose",
          &rightGripPosePath));

      std::vector<XrActionSuggestedBinding> pico4sBindings{{
          {m_p4uControllerTriggerAction, triggerValuePath[Side::LEFT]},
          {m_p4uControllerTriggerAction, triggerValuePath[Side::RIGHT]},
          {m_p4uControllerAimAction, leftAimPosePath},
          {m_p4uControllerAimAction, rightAimPosePath},
          {m_p4uControllerGripAction, leftGripPosePath},
          {m_p4uControllerGripAction, rightGripPosePath},
]==])

_p4u_replace_if_missing(
    "dedicated PICO controller bindings v17"
    "{m_p4uControllerAimAction, leftAimPosePath}"
    "${_controller_bindings_old}"
    "${_controller_bindings_new}"
)

set(_controller_spaces_anchor [==[
    XrSessionActionSetsAttachInfo attachInfo{XR_TYPE_SESSION_ACTION_SETS_ATTACH_INFO};
]==])

set(_controller_spaces_replacement [==[
    // P4U v17: controller aim/grip spaces are distinct from the generic hand-interaction
    // action spaces above.
    XrActionSpaceCreateInfo controllerSpaceInfo{XR_TYPE_ACTION_SPACE_CREATE_INFO};
    controllerSpaceInfo.poseInActionSpace.orientation.w = 1.f;

    for (auto hand : {Side::LEFT, Side::RIGHT}) {
      controllerSpaceInfo.subactionPath = m_input.handSubactionPath[hand];

      controllerSpaceInfo.action = m_p4uControllerAimAction;
      CHECK_XRCMD(xrCreateActionSpace(
          m_session, &controllerSpaceInfo, &m_p4uControllerAimSpace[hand]));

      controllerSpaceInfo.action = m_p4uControllerGripAction;
      CHECK_XRCMD(xrCreateActionSpace(
          m_session, &controllerSpaceInfo, &m_p4uControllerGripSpace[hand]));
    }

    XrSessionActionSetsAttachInfo attachInfo{XR_TYPE_SESSION_ACTION_SETS_ATTACH_INFO};
]==])

_p4u_replace_if_missing(
    "dedicated controller spaces v17"
    "m_p4uControllerAimSpace[hand]"
    "${_controller_spaces_anchor}"
    "${_controller_spaces_replacement}"
)

set(_controller_poll_anchor [==[
    // Get pose and grab action state and start haptic vibrate when hand is 90% squeezed.
]==])

set(_controller_poll_replacement [==[
    // P4U v17: poll physical PICO controller actions independently from hand interaction.
    for (auto hand : {Side::LEFT, Side::RIGHT}) {
      XrActionStateGetInfo controllerGetInfo{XR_TYPE_ACTION_STATE_GET_INFO};
      controllerGetInfo.subactionPath = m_input.handSubactionPath[hand];

      controllerGetInfo.action = m_p4uControllerAimAction;
      XrActionStatePose controllerAimState{XR_TYPE_ACTION_STATE_POSE};
      CHECK_XRCMD(xrGetActionStatePose(
          m_session, &controllerGetInfo, &controllerAimState));
      m_p4uControllerAimActive[hand] = controllerAimState.isActive;

      controllerGetInfo.action = m_p4uControllerTriggerAction;
      XrActionStateFloat controllerTriggerState{XR_TYPE_ACTION_STATE_FLOAT};
      CHECK_XRCMD(xrGetActionStateFloat(
          m_session, &controllerGetInfo, &controllerTriggerState));
      m_p4uControllerTriggerValue[hand] =
          controllerTriggerState.isActive == XR_TRUE
              ? controllerTriggerState.currentState
              : 0.0f;
    }

    // Get pose and grab action state and start haptic vibrate when hand is 90% squeezed.
]==])

_p4u_replace_if_missing(
    "poll dedicated controller actions v17"
    "P4U v17: poll physical PICO controller actions independently"
    "${_controller_poll_anchor}"
    "${_controller_poll_replacement}"
)

set(_controller_render_locals_old [==[
      const InputState::ToggleStatus controllerToggle = m_input.handToggle[hand];
      bool controllerPoseValid = false;
      XrPosef controllerPose{};
]==])

set(_controller_render_locals_new [==[
      const InputState::ToggleStatus controllerToggle =
          m_p4uControllerTriggerValue[hand] > 0.75f
              ? InputState::PRESS_DOWN
              : InputState::RELEASE;
      bool controllerPoseValid = false;
      XrPosef controllerPose{};
      bool controllerGripPoseValid = false;
      XrPosef controllerGripPose{};
]==])

_p4u_replace_if_missing(
    "controller render locals v17"
    "controllerGripPoseValid = false"
    "${_controller_render_locals_old}"
    "${_controller_render_locals_new}"
)

set(_controller_locate_old [==[
      XrSpaceLocation spaceLocation{XR_TYPE_SPACE_LOCATION};
      res = xrLocateSpace(m_input.handSpace[hand], m_appSpace, predictedDisplayTime, &spaceLocation);
      CHECK_XRRESULT(res, "xrLocateSpace");
      if (XR_UNQUALIFIED_SUCCESS(res) &&
          (spaceLocation.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0 &&
          (spaceLocation.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT) != 0) {
        controllerPose = spaceLocation.pose;
        controllerPoseValid = true;
]==])

set(_controller_locate_new [==[
      // P4U v17: locate the physical controller aim space directly. This is never shared
      // with XR_EXT_hand_interaction.
      XrSpaceLocation spaceLocation{XR_TYPE_SPACE_LOCATION};
      res = xrLocateSpace(
          m_p4uControllerAimSpace[hand],
          m_appSpace,
          predictedDisplayTime,
          &spaceLocation);
      CHECK_XRRESULT(res, "xrLocateSpace(controller aim)");
      if (m_p4uControllerAimActive[hand] == XR_TRUE &&
          XR_UNQUALIFIED_SUCCESS(res) &&
          (spaceLocation.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0 &&
          (spaceLocation.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT) != 0) {
        controllerPose = spaceLocation.pose;
        controllerPoseValid = true;

        XrSpaceLocation gripLocation{XR_TYPE_SPACE_LOCATION};
        const XrResult gripResult = xrLocateSpace(
            m_p4uControllerGripSpace[hand],
            m_appSpace,
            predictedDisplayTime,
            &gripLocation);
        CHECK_XRRESULT(gripResult, "xrLocateSpace(controller grip)");
        if (XR_UNQUALIFIED_SUCCESS(gripResult) &&
            (gripLocation.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0 &&
            (gripLocation.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT) != 0) {
          controllerGripPose = gripLocation.pose;
          controllerGripPoseValid = true;
        }
]==])

_p4u_replace_if_missing(
    "locate dedicated controller poses v17"
    "xrLocateSpace(controller aim)"
    "${_controller_locate_old}"
    "${_controller_locate_new}"
)

set(_controller_proxy_old [==[
        float scale = 0.1f * m_input.handScale[hand];
        if (renderControllerCubes && useController) {
          cubes.push_back(Cube{pose, {scale, scale, scale}});
        }
        handPoses[hand] = pose;
]==])

set(_controller_proxy_new [==[
        float scale = 0.1f * m_input.handScale[hand];

        // P4U v17 diagnostic controller proxy. Use grip pose for the physical body and
        // animate its size with trigger pressure. It is deliberately simple until the
        // final controller model is chosen.
        if (useController && controllerGripPoseValid) {
          const float trigger = std::min(
              1.0f, std::max(0.0f, m_p4uControllerTriggerValue[hand]));
          const float bodyScale = 0.045f - 0.010f * trigger;
          cubes.push_back(Cube{
              controllerGripPose,
              {bodyScale, bodyScale * 1.45f, bodyScale * 0.80f}});
        }
        handPoses[hand] = pose;
]==])

_p4u_replace_if_missing_or_superseded(
    "dedicated controller proxy v17"
    "P4U v17 diagnostic controller proxy"
    "P4U v19: controller proxy removed"
    "${_controller_proxy_old}"
    "${_controller_proxy_new}"
)


# P4U v18: restore symmetric controller <-> hand switching after controller/action
# separation. Controller tracking jitter must not keep ownership forever, and hand
# presentation/input should use the finger joints actually needed by the product.

set(_controller_activity_threshold_old [==[
          if (positionDeltaSq >= 0.000036f || angularDelta >= 0.020f) {
            m_p4uControllerRecentFrames[hand] = 90;
          }
]==])

set(_controller_activity_threshold_new [==[
          // P4U v18: ignore normal controller tracking jitter. A source switch should
          // require deliberate motion, not millimetre/sub-degree pose noise.
          constexpr float kControllerTakeoverPositionSq = 0.000225f;  // 15 mm
          constexpr float kControllerTakeoverAngle = 0.070f;          // ~4 degrees
          if (positionDeltaSq >= kControllerTakeoverPositionSq ||
              angularDelta >= kControllerTakeoverAngle) {
            m_p4uControllerRecentFrames[hand] = 45;
          }
]==])

_p4u_replace_if_missing(
    "controller deliberate activity threshold v18"
    "kControllerTakeoverPositionSq = 0.000225f"
    "${_controller_activity_threshold_old}"
    "${_controller_activity_threshold_new}"
)

set(_controller_trigger_sticky_old [==[
      if (controllerToggle == InputState::PRESS_DOWN) {
        m_p4uControllerRecentFrames[hand] = 90;
      }
]==])

set(_controller_trigger_sticky_new [==[
      if (controllerToggle == InputState::PRESS_DOWN ||
          m_p4uControllerTriggerValue[hand] > 0.05f) {
        m_p4uControllerRecentFrames[hand] = 45;
      }
]==])

_p4u_replace_if_missing(
    "controller trigger activity v18"
    "m_p4uControllerTriggerValue[hand] > 0.05f"
    "${_controller_trigger_sticky_old}"
    "${_controller_trigger_sticky_new}"
)

set(_hand_availability_old [==[
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
]==])

set(_hand_availability_new [==[
        const bool palmValid =
            (palm.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0 &&
            (palm.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT) != 0;
        const bool pinchJointsValid =
            (thumbTip.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0 &&
            (indexTip.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0;
        const bool indexAimValid =
            (indexTip.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0 &&
            (indexTip.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT) != 0;

        uint32_t trackedJointCount = 0;
        if (XR_UNQUALIFIED_SUCCESS(handResult)) {
          for (int jointIndex = 0; jointIndex < XR_HAND_JOINT_COUNT_EXT; ++jointIndex) {
            if ((m_p4uHandJoints[hand][jointIndex].locationFlags &
                 XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0) {
              ++trackedJointCount;
            }
          }
        }

        // Presentation follows raw joint availability. It stays visible even when the
        // stricter interaction requirements are temporarily not met.
        handSkeletonVisible[hand] = trackedJointCount >= 6;

        // P4U v18: direct interaction needs the index aim pose and thumb position, not a
        // valid palm orientation. Requiring the palm made hand takeover unnecessarily
        // fragile after the controller actions were split.
        const bool directActive =
            XR_UNQUALIFIED_SUCCESS(handResult) && indexAimValid && pinchJointsValid;
]==])

_p4u_replace_if_missing(
    "finger based hand availability v18"
    "P4U v18: direct interaction needs the index aim pose"
    "${_hand_availability_old}"
    "${_hand_availability_new}"
)

set(_hand_visibility_interaction_gate_old [==[
      // P4U: hand visualization follows tracking presence, not pointer ownership.
      // Source arbitration may keep a controller sticky for interaction while the real
      // hand is still fully tracked; hiding the skeleton in that state caused flicker.
      handSkeletonVisible[hand] = directHandActive;
]==])

set(_hand_visibility_interaction_gate_new [==[
      // P4U v18: skeleton visibility was resolved from raw tracked joints above.
      // Do not tie presentation to pointer-source arbitration.
]==])

_p4u_replace_if_missing(
    "decouple hand visualization from arbitration v18"
    "skeleton visibility was resolved from raw tracked joints above"
    "${_hand_visibility_interaction_gate_old}"
    "${_hand_visibility_interaction_gate_new}"
)


# P4U v19: remove temporary controller proxy geometry and stabilize hand activation.
# The pointer must not move underneath the user when thumb/index pinch crosses the click threshold.

set(_stable_hand_pointer_state_anchor [==[
  std::array<int, Side::COUNT> m_p4uPointerSource{{0, 0}};
]==])

set(_stable_hand_pointer_state_replacement [==[
  std::array<int, Side::COUNT> m_p4uPointerSource{{0, 0}};
  std::array<XrPosef, Side::COUNT> m_p4uStableHandPointerPose{};
  std::array<bool, Side::COUNT> m_p4uStableHandPointerValid{{false, false}};
]==])

_p4u_replace_if_missing(
    "stable hand pointer state v19"
    "m_p4uStableHandPointerValid{{false, false}}"
    "${_stable_hand_pointer_state_anchor}"
    "${_stable_hand_pointer_state_replacement}"
)

set(_stable_hand_joint_anchor [==[
        const auto& palm = m_p4uHandJoints[hand][XR_HAND_JOINT_PALM_EXT];
        const auto& thumbTip = m_p4uHandJoints[hand][XR_HAND_JOINT_THUMB_TIP_EXT];
        const auto& indexTip = m_p4uHandJoints[hand][XR_HAND_JOINT_INDEX_TIP_EXT];
]==])

set(_stable_hand_joint_replacement [==[
        const auto& palm = m_p4uHandJoints[hand][XR_HAND_JOINT_PALM_EXT];
        const auto& thumbTip = m_p4uHandJoints[hand][XR_HAND_JOINT_THUMB_TIP_EXT];
        const auto& thumbMetacarpal =
            m_p4uHandJoints[hand][XR_HAND_JOINT_THUMB_METACARPAL_EXT];
        const auto& indexTip = m_p4uHandJoints[hand][XR_HAND_JOINT_INDEX_TIP_EXT];
]==])

_p4u_replace_if_missing(
    "thumb base control reference v19"
    "const auto& thumbMetacarpal ="
    "${_stable_hand_joint_anchor}"
    "${_stable_hand_joint_replacement}"
)

set(_stable_hand_control_old [==[
          // P4U: keep the hand control point near the index fingertip, but shift it
          // slightly toward the thumb so it sits closer to the natural pinch/control area.
          directHandActive = true;
          directHandPose = indexTip.pose;
          constexpr float kHandControlPointTowardThumb = 0.20f;
          directHandPose.position.x +=
              (thumbTip.pose.position.x - indexTip.pose.position.x) *
              kHandControlPointTowardThumb;
          directHandPose.position.y +=
              (thumbTip.pose.position.y - indexTip.pose.position.y) *
              kHandControlPointTowardThumb;
          directHandPose.position.z +=
              (thumbTip.pose.position.z - indexTip.pose.position.z) *
              kHandControlPointTowardThumb;

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
]==])

set(_stable_hand_control_new [==[
          directHandActive = true;

          // P4U v19: stable offset toward thumb base instead of the moving thumb tip.
          XrPosef handPointerCandidate = indexTip.pose;
          const bool thumbBaseValid =
              (thumbMetacarpal.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0;
          if (thumbBaseValid) {
            XrVector3f towardThumbBase{
                thumbMetacarpal.pose.position.x - indexTip.pose.position.x,
                thumbMetacarpal.pose.position.y - indexTip.pose.position.y,
                thumbMetacarpal.pose.position.z - indexTip.pose.position.z,
            };
            const float thumbBaseDistance = XrVector3f_Length(&towardThumbBase);
            if (thumbBaseDistance > 0.001f) {
              XrVector3f_Normalize(&towardThumbBase);
              constexpr float kHandControlPointOffsetMeters = 0.012f;
              handPointerCandidate.position.x += towardThumbBase.x * kHandControlPointOffsetMeters;
              handPointerCandidate.position.y += towardThumbBase.y * kHandControlPointOffsetMeters;
              handPointerCandidate.position.z += towardThumbBase.z * kHandControlPointOffsetMeters;
            }
          }

          const float dx = thumbTip.pose.position.x - indexTip.pose.position.x;
          const float dy = thumbTip.pose.position.y - indexTip.pose.position.y;
          const float dz = thumbTip.pose.position.z - indexTip.pose.position.z;
          const float pinchDistance = std::sqrt(dx * dx + dy * dy + dz * dz);

          const bool previousPinch = m_p4uHandPinched[hand];
          bool pinched = previousPinch;
          if (!pinched && pinchDistance <= 0.028f) {
            pinched = true;
          } else if (pinched && pinchDistance >= 0.045f) {
            pinched = false;
          }

          // Freeze full pointer pose while pinched so activation stays on the pre-pinch target.
          if (!pinched) {
            m_p4uStableHandPointerPose[hand] = handPointerCandidate;
            m_p4uStableHandPointerValid[hand] = true;
            directHandPose = handPointerCandidate;
          } else if (m_p4uStableHandPointerValid[hand]) {
            directHandPose = m_p4uStableHandPointerPose[hand];
          } else {
            directHandPose = handPointerCandidate;
          }

          m_p4uHandPinched[hand] = pinched;
]==])

_p4u_replace_if_missing(
    "stable pinch control point v19"
    "P4U v19: stable offset toward thumb base"
    "${_stable_hand_control_old}"
    "${_stable_hand_control_new}"
)

set(_stable_hand_tracking_loss_old [==[
          m_p4uDirectHandWasActive[hand] = false;
          m_p4uHandPinched[hand] = false;
]==])

set(_stable_hand_tracking_loss_new [==[
          m_p4uDirectHandWasActive[hand] = false;
          m_p4uHandPinched[hand] = false;
          m_p4uStableHandPointerValid[hand] = false;
]==])

_p4u_replace_if_missing(
    "reset stable hand pointer on tracking loss v19"
    "m_p4uStableHandPointerValid[hand] = false"
    "${_stable_hand_tracking_loss_old}"
    "${_stable_hand_tracking_loss_new}"
)

set(_controller_proxy_remove_old [==[
        // P4U v17 diagnostic controller proxy. Use grip pose for the physical body and
        // animate its size with trigger pressure. It is deliberately simple until the
        // final controller model is chosen.
        if (useController && controllerGripPoseValid) {
          const float trigger = std::min(
              1.0f, std::max(0.0f, m_p4uControllerTriggerValue[hand]));
          const float bodyScale = 0.045f - 0.010f * trigger;
          cubes.push_back(Cube{
              controllerGripPose,
              {bodyScale, bodyScale * 1.45f, bodyScale * 0.80f}});
        }
]==])

set(_controller_proxy_remove_new [==[
        // P4U v19: controller proxy removed. Controller input and beam remain active.
]==])

_p4u_replace_if_missing(
    "remove diagnostic controller proxy v19"
    "P4U v19: controller proxy removed"
    "${_controller_proxy_remove_old}"
    "${_controller_proxy_remove_new}"
)


# P4U v20: restore the last hardware-validated hand interaction semantics. Controller
# separation remains intact, but finger pointing/clicking again uses the raw index-tip pose
# plus the original thumb/index pinch hysteresis.

set(_restore_index_pointer_old [==[
          directHandActive = true;

          // P4U v19: stable offset toward thumb base instead of the moving thumb tip.
          XrPosef handPointerCandidate = indexTip.pose;
          const bool thumbBaseValid =
              (thumbMetacarpal.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0;
          if (thumbBaseValid) {
            XrVector3f towardThumbBase{
                thumbMetacarpal.pose.position.x - indexTip.pose.position.x,
                thumbMetacarpal.pose.position.y - indexTip.pose.position.y,
                thumbMetacarpal.pose.position.z - indexTip.pose.position.z,
            };
            const float thumbBaseDistance = XrVector3f_Length(&towardThumbBase);
            if (thumbBaseDistance > 0.001f) {
              XrVector3f_Normalize(&towardThumbBase);
              constexpr float kHandControlPointOffsetMeters = 0.012f;
              handPointerCandidate.position.x += towardThumbBase.x * kHandControlPointOffsetMeters;
              handPointerCandidate.position.y += towardThumbBase.y * kHandControlPointOffsetMeters;
              handPointerCandidate.position.z += towardThumbBase.z * kHandControlPointOffsetMeters;
            }
          }

          const float dx = thumbTip.pose.position.x - indexTip.pose.position.x;
          const float dy = thumbTip.pose.position.y - indexTip.pose.position.y;
          const float dz = thumbTip.pose.position.z - indexTip.pose.position.z;
          const float pinchDistance = std::sqrt(dx * dx + dy * dy + dz * dz);

          const bool previousPinch = m_p4uHandPinched[hand];
          bool pinched = previousPinch;
          if (!pinched && pinchDistance <= 0.028f) {
            pinched = true;
          } else if (pinched && pinchDistance >= 0.045f) {
            pinched = false;
          }

          // Freeze full pointer pose while pinched so activation stays on the pre-pinch target.
          if (!pinched) {
            m_p4uStableHandPointerPose[hand] = handPointerCandidate;
            m_p4uStableHandPointerValid[hand] = true;
            directHandPose = handPointerCandidate;
          } else if (m_p4uStableHandPointerValid[hand]) {
            directHandPose = m_p4uStableHandPointerPose[hand];
          } else {
            directHandPose = handPointerCandidate;
          }

          m_p4uHandPinched[hand] = pinched;
]==])

set(_restore_index_pointer_new [==[
          directHandActive = true;

          // P4U v20: restored index fingertip interaction. This is the last
          // hardware-validated finger pointer/click behavior from before the controller
          // rendering changes. Keep these legacy markers for migration idempotence:
          // P4U v19: stable offset toward thumb base instead of the moving thumb tip.
          constexpr float kHandControlPointOffsetMeters = 0.012f;
          (void)kHandControlPointOffsetMeters;
          directHandPose = indexTip.pose;

          const float dx = thumbTip.pose.position.x - indexTip.pose.position.x;
          const float dy = thumbTip.pose.position.y - indexTip.pose.position.y;
          const float dz = thumbTip.pose.position.z - indexTip.pose.position.z;
          const float pinchDistance = std::sqrt(dx * dx + dy * dy + dz * dz);

          // Original hardware-validated hysteresis.
          const bool previousPinch = m_p4uHandPinched[hand];
          bool pinched = previousPinch;
          if (!pinched && pinchDistance <= 0.028f) {
            pinched = true;
          } else if (pinched && pinchDistance >= 0.045f) {
            pinched = false;
          }

          m_p4uHandPinched[hand] = pinched;
]==])

_p4u_replace_if_missing(
    "restore hardware-validated index pointer v20"
    "P4U v20: restored index fingertip interaction"
    "${_restore_index_pointer_old}"
    "${_restore_index_pointer_new}"
)


# P4U v21: optional PICO Motion Tracker / XR_BD_body_tracking debug skeleton.
# This is presentation-only and does not participate in controller/hand input arbitration.

set(_body_capability_old [==[
    m_handTrackingSupported =
        p4uHasExtension(XR_EXT_HAND_TRACKING_EXTENSION_NAME);

    Log::Write(
]==])

set(_body_capability_new [==[
    m_handTrackingSupported =
        p4uHasExtension(XR_EXT_HAND_TRACKING_EXTENSION_NAME);
    m_bodyTrackingSupported =
        p4uHasExtension(XR_BD_BODY_TRACKING_EXTENSION_NAME);

    Log::Write(
]==])

_p4u_replace_if_missing(
    "body tracking capability probe v21"
    "m_bodyTrackingSupported ="
    "${_body_capability_old}"
    "${_body_capability_new}"
)

set(_body_capability_log_old [==[
            "XR_EXT_hand_interaction=%s XR_EXT_hand_tracking=%s",
            m_picoControllerInteractionSupported ? "yes" : "no",
            m_handInteractionSupported ? "yes" : "no",
            m_handTrackingSupported ? "yes" : "no"));
]==])

set(_body_capability_log_new [==[
            "XR_EXT_hand_interaction=%s XR_EXT_hand_tracking=%s "
            "XR_BD_body_tracking=%s",
            m_picoControllerInteractionSupported ? "yes" : "no",
            m_handInteractionSupported ? "yes" : "no",
            m_handTrackingSupported ? "yes" : "no",
            m_bodyTrackingSupported ? "yes" : "no"));
]==])

_p4u_replace_if_missing(
    "body tracking capability log v21"
    "XR_BD_body_tracking=%s"
    "${_body_capability_log_old}"
    "${_body_capability_log_new}"
)

set(_body_extension_old [==[
    if (m_handTrackingSupported) {
      extensions.push_back(XR_EXT_HAND_TRACKING_EXTENSION_NAME);
      Log::Write(Log::Level::Info, "P4U: enabling XR_EXT_hand_tracking");
    } else {
      Log::Write(
          Log::Level::Warning,
          "P4U: XR_EXT_hand_tracking unavailable; direct hand fallback disabled");
    }
]==])

set(_body_extension_new [==[
    if (m_handTrackingSupported) {
      extensions.push_back(XR_EXT_HAND_TRACKING_EXTENSION_NAME);
      Log::Write(Log::Level::Info, "P4U: enabling XR_EXT_hand_tracking");
    } else {
      Log::Write(
          Log::Level::Warning,
          "P4U: XR_EXT_hand_tracking unavailable; direct hand fallback disabled");
    }

    if (m_bodyTrackingSupported) {
      extensions.push_back(XR_BD_BODY_TRACKING_EXTENSION_NAME);
      Log::Write(Log::Level::Info, "P4U: enabling XR_BD_body_tracking");
    } else {
      Log::Write(
          Log::Level::Info,
          "P4U: XR_BD_body_tracking unavailable; Motion Tracker skeleton disabled");
    }
]==])

_p4u_replace_if_missing(
    "body tracking extension enable v21"
    "P4U: enabling XR_BD_body_tracking"
    "${_body_extension_old}"
    "${_body_extension_new}"
)

set(_body_member_support_old [==[
  bool m_handTrackingSupported{false};
  bool m_handTrackingSystemSupported{false};
]==])

set(_body_member_support_new [==[
  bool m_handTrackingSupported{false};
  bool m_handTrackingSystemSupported{false};
  bool m_bodyTrackingSupported{false};
  bool m_bodyTrackingSystemSupported{false};
]==])

_p4u_replace_if_missing(
    "body tracking support state v21"
    "m_bodyTrackingSystemSupported{false}"
    "${_body_member_support_old}"
    "${_body_member_support_new}"
)

set(_body_member_runtime_anchor [==[
  std::array<int, Side::COUNT> m_p4uPointerSource{{0, 0}};
]==])

set(_body_member_runtime_replacement [==[
  std::array<int, Side::COUNT> m_p4uPointerSource{{0, 0}};

  // P4U v21: optional full-body Motion Tracker state.
  PFN_xrCreateBodyTrackerBD m_xrCreateBodyTrackerBD{nullptr};
  PFN_xrDestroyBodyTrackerBD m_xrDestroyBodyTrackerBD{nullptr};
  PFN_xrLocateBodyJointsBD m_xrLocateBodyJointsBD{nullptr};
  XrBodyTrackerBD m_p4uBodyTracker{XR_NULL_HANDLE};
  std::array<XrBodyJointLocationBD, XR_BODY_JOINT_COUNT_BD> m_p4uBodyJoints{};
]==])

_p4u_replace_if_missing(
    "body tracking runtime state v21"
    "m_xrCreateBodyTrackerBD{nullptr}"
    "${_body_member_runtime_anchor}"
    "${_body_member_runtime_replacement}"
)

set(_body_init_anchor [==[
  void CreateVisualizedSpaces() {
]==])

set(_body_init_replacement [==[
  // P4U v21: initialize native XR_BD_body_tracking only when the runtime/device supports it.
  void InitializeP4uBodyTracking() {
    if (!m_bodyTrackingSupported) {
      return;
    }

    XrSystemBodyTrackingPropertiesBD bodyProperties{
        XR_TYPE_SYSTEM_BODY_TRACKING_PROPERTIES_BD};
    XrSystemProperties systemProperties{XR_TYPE_SYSTEM_PROPERTIES};
    systemProperties.next = &bodyProperties;
    const XrResult propertiesResult =
        xrGetSystemProperties(m_instance, m_systemId, &systemProperties);
    if (XR_FAILED(propertiesResult) || bodyProperties.supportsBodyTracking != XR_TRUE) {
      Log::Write(
          Log::Level::Info,
          "P4U: XR_BD_body_tracking extension present but body tracking unsupported");
      return;
    }
    m_bodyTrackingSystemSupported = true;

    PFN_xrVoidFunction function = nullptr;
    if (XR_FAILED(xrGetInstanceProcAddr(
            m_instance, "xrCreateBodyTrackerBD", &function)) ||
        function == nullptr) {
      Log::Write(Log::Level::Warning, "P4U: xrCreateBodyTrackerBD unavailable");
      return;
    }
    m_xrCreateBodyTrackerBD =
        reinterpret_cast<PFN_xrCreateBodyTrackerBD>(function);

    function = nullptr;
    if (XR_FAILED(xrGetInstanceProcAddr(
            m_instance, "xrDestroyBodyTrackerBD", &function)) ||
        function == nullptr) {
      Log::Write(Log::Level::Warning, "P4U: xrDestroyBodyTrackerBD unavailable");
      return;
    }
    m_xrDestroyBodyTrackerBD =
        reinterpret_cast<PFN_xrDestroyBodyTrackerBD>(function);

    function = nullptr;
    if (XR_FAILED(xrGetInstanceProcAddr(
            m_instance, "xrLocateBodyJointsBD", &function)) ||
        function == nullptr) {
      Log::Write(Log::Level::Warning, "P4U: xrLocateBodyJointsBD unavailable");
      return;
    }
    m_xrLocateBodyJointsBD =
        reinterpret_cast<PFN_xrLocateBodyJointsBD>(function);

    XrBodyTrackerCreateInfoBD createInfo{XR_TYPE_BODY_TRACKER_CREATE_INFO_BD};
    createInfo.jointSet = XR_BODY_JOINT_SET_FULL_BODY_JOINTS_BD;
    const XrResult createResult =
        m_xrCreateBodyTrackerBD(m_session, &createInfo, &m_p4uBodyTracker);
    if (XR_FAILED(createResult)) {
      m_p4uBodyTracker = XR_NULL_HANDLE;
      Log::Write(
          Log::Level::Info,
          Fmt("P4U: Motion Tracker body tracker not active (%d)", createResult));
      return;
    }

    Log::Write(
        Log::Level::Info,
        "P4U: Motion Tracker full-body tracker initialized (24 joints)");
  }

  void CreateVisualizedSpaces() {
]==])

_p4u_replace_if_missing(
    "body tracking initializer v21"
    "P4U v21: initialize native XR_BD_body_tracking"
    "${_body_init_anchor}"
    "${_body_init_replacement}"
)

set(_body_init_call_old [==[
    InitializeP4uHandTracking();
    CreateVisualizedSpaces();
]==])

set(_body_init_call_new [==[
    InitializeP4uHandTracking();
    InitializeP4uBodyTracking();
    CreateVisualizedSpaces();
]==])

_p4u_replace_if_missing(
    "body tracking initializer call v21"
    "InitializeP4uBodyTracking();"
    "${_body_init_call_old}"
    "${_body_init_call_new}"
)

set(_body_destroy_anchor [==[
  ~OpenXrProgram() override {
    if (m_xrDestroyHandTrackerEXT != nullptr) {
]==])

set(_body_destroy_replacement [==[
  ~OpenXrProgram() override {
    if (m_xrDestroyBodyTrackerBD != nullptr &&
        m_p4uBodyTracker != XR_NULL_HANDLE) {
      m_xrDestroyBodyTrackerBD(m_p4uBodyTracker);
      m_p4uBodyTracker = XR_NULL_HANDLE;
    }

    if (m_xrDestroyHandTrackerEXT != nullptr) {
]==])

_p4u_replace_if_missing(
    "body tracker cleanup v21"
    "m_xrDestroyBodyTrackerBD(m_p4uBodyTracker)"
    "${_body_destroy_anchor}"
    "${_body_destroy_replacement}"
)

set(_body_skeleton_build_anchor [==[
    // Render view to the appropriate part of the swapchain image.
]==])

set(_body_skeleton_build_replacement [==[
    // P4U v21: optional Motion Tracker full-body debug skeleton. It appears only when
    // enough body joints are valid in the current frame.
    std::vector<Geometry::Vertex> bodySkeletonVerts;
    std::vector<uint16_t> bodySkeletonIndices;
    bool bodySkeletonVisible = false;

    if (m_bodyTrackingSystemSupported &&
        m_xrLocateBodyJointsBD != nullptr &&
        m_p4uBodyTracker != XR_NULL_HANDLE) {
      XrBodyJointsLocateInfoBD bodyLocateInfo{XR_TYPE_BODY_JOINTS_LOCATE_INFO_BD};
      bodyLocateInfo.baseSpace = m_appSpace;
      bodyLocateInfo.time = predictedDisplayTime;

      XrBodyJointLocationsBD bodyLocations{XR_TYPE_BODY_JOINT_LOCATIONS_BD};
      bodyLocations.jointLocationCount = XR_BODY_JOINT_COUNT_BD;
      bodyLocations.jointLocations = m_p4uBodyJoints.data();

      const XrResult bodyResult =
          m_xrLocateBodyJointsBD(m_p4uBodyTracker, &bodyLocateInfo, &bodyLocations);

      uint32_t validBodyJoints = 0;
      if (XR_UNQUALIFIED_SUCCESS(bodyResult)) {
        for (const auto& joint : m_p4uBodyJoints) {
          if ((joint.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0) {
            ++validBodyJoints;
          }
        }
      }

      // Require a meaningful body solution, not a couple of stale tracker points.
      bodySkeletonVisible = validBodyJoints >= 10;

      if (bodySkeletonVisible) {
        constexpr int kBodyTubeSides = 6;
        const XrVector3f bodyColor{0.58f, 0.88f, 0.76f};
        const XrVector3f bodyJointColor{0.78f, 0.96f, 0.88f};

        const auto bodyJointValid = [&](XrBodyJointBD joint) {
          return (m_p4uBodyJoints[joint].locationFlags &
                  XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0;
        };

        const auto appendBodyJoint =
            [&](const XrVector3f& center, float radius) {
              if (bodySkeletonVerts.size() + 6 >= 65535) return;
              const uint16_t base =
                  static_cast<uint16_t>(bodySkeletonVerts.size());
              bodySkeletonVerts.push_back(
                  {{center.x + radius, center.y, center.z}, bodyJointColor});
              bodySkeletonVerts.push_back(
                  {{center.x - radius, center.y, center.z}, bodyJointColor});
              bodySkeletonVerts.push_back(
                  {{center.x, center.y + radius, center.z}, bodyJointColor});
              bodySkeletonVerts.push_back(
                  {{center.x, center.y - radius, center.z}, bodyJointColor});
              bodySkeletonVerts.push_back(
                  {{center.x, center.y, center.z + radius}, bodyJointColor});
              bodySkeletonVerts.push_back(
                  {{center.x, center.y, center.z - radius}, bodyJointColor});

              const uint16_t faces[][3] = {
                  {0, 2, 4}, {2, 1, 4}, {1, 3, 4}, {3, 0, 4},
                  {2, 0, 5}, {1, 2, 5}, {3, 1, 5}, {0, 3, 5},
              };
              for (const auto& face : faces) {
                bodySkeletonIndices.push_back(base + face[0]);
                bodySkeletonIndices.push_back(base + face[1]);
                bodySkeletonIndices.push_back(base + face[2]);
              }
            };

        const auto appendBodyBone =
            [&](const XrVector3f& a, const XrVector3f& b, float radius) {
              XrVector3f direction{b.x - a.x, b.y - a.y, b.z - a.z};
              const float length = XrVector3f_Length(&direction);
              if (length < 0.001f ||
                  bodySkeletonVerts.size() + kBodyTubeSides * 2 >= 65535) {
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
                  static_cast<uint16_t>(bodySkeletonVerts.size());
              for (int ring = 0; ring < 2; ++ring) {
                const XrVector3f& center = ring == 0 ? a : b;
                for (int sideIndex = 0; sideIndex < kBodyTubeSides; ++sideIndex) {
                  const float angle =
                      (2.0f * MATH_PI * static_cast<float>(sideIndex)) /
                      static_cast<float>(kBodyTubeSides);
                  const float cs = std::cos(angle);
                  const float sn = std::sin(angle);
                  bodySkeletonVerts.push_back({
                      {
                          center.x + radius * (axisU.x * cs + axisV.x * sn),
                          center.y + radius * (axisU.y * cs + axisV.y * sn),
                          center.z + radius * (axisU.z * cs + axisV.z * sn),
                      },
                      bodyColor,
                  });
                }
              }

              for (int sideIndex = 0; sideIndex < kBodyTubeSides; ++sideIndex) {
                const int next = (sideIndex + 1) % kBodyTubeSides;
                const uint16_t a0 = base + static_cast<uint16_t>(sideIndex);
                const uint16_t a1 = base + static_cast<uint16_t>(next);
                const uint16_t b1 =
                    base + static_cast<uint16_t>(kBodyTubeSides + next);
                const uint16_t b0 =
                    base + static_cast<uint16_t>(kBodyTubeSides + sideIndex);
                bodySkeletonIndices.push_back(a0);
                bodySkeletonIndices.push_back(a1);
                bodySkeletonIndices.push_back(b1);
                bodySkeletonIndices.push_back(a0);
                bodySkeletonIndices.push_back(b1);
                bodySkeletonIndices.push_back(b0);
              }
            };

        const std::array<std::pair<XrBodyJointBD, XrBodyJointBD>, 23>
            bodyBones{{
                {XR_BODY_JOINT_PELVIS_BD, XR_BODY_JOINT_LEFT_HIP_BD},
                {XR_BODY_JOINT_PELVIS_BD, XR_BODY_JOINT_RIGHT_HIP_BD},
                {XR_BODY_JOINT_PELVIS_BD, XR_BODY_JOINT_SPINE1_BD},
                {XR_BODY_JOINT_LEFT_HIP_BD, XR_BODY_JOINT_LEFT_KNEE_BD},
                {XR_BODY_JOINT_LEFT_KNEE_BD, XR_BODY_JOINT_LEFT_ANKLE_BD},
                {XR_BODY_JOINT_LEFT_ANKLE_BD, XR_BODY_JOINT_LEFT_FOOT_BD},
                {XR_BODY_JOINT_RIGHT_HIP_BD, XR_BODY_JOINT_RIGHT_KNEE_BD},
                {XR_BODY_JOINT_RIGHT_KNEE_BD, XR_BODY_JOINT_RIGHT_ANKLE_BD},
                {XR_BODY_JOINT_RIGHT_ANKLE_BD, XR_BODY_JOINT_RIGHT_FOOT_BD},
                {XR_BODY_JOINT_SPINE1_BD, XR_BODY_JOINT_SPINE2_BD},
                {XR_BODY_JOINT_SPINE2_BD, XR_BODY_JOINT_SPINE3_BD},
                {XR_BODY_JOINT_SPINE3_BD, XR_BODY_JOINT_NECK_BD},
                {XR_BODY_JOINT_NECK_BD, XR_BODY_JOINT_HEAD_BD},
                {XR_BODY_JOINT_NECK_BD, XR_BODY_JOINT_LEFT_COLLAR_BD},
                {XR_BODY_JOINT_LEFT_COLLAR_BD, XR_BODY_JOINT_LEFT_SHOULDER_BD},
                {XR_BODY_JOINT_LEFT_SHOULDER_BD, XR_BODY_JOINT_LEFT_ELBOW_BD},
                {XR_BODY_JOINT_LEFT_ELBOW_BD, XR_BODY_JOINT_LEFT_WRIST_BD},
                {XR_BODY_JOINT_LEFT_WRIST_BD, XR_BODY_JOINT_LEFT_HAND_BD},
                {XR_BODY_JOINT_NECK_BD, XR_BODY_JOINT_RIGHT_COLLAR_BD},
                {XR_BODY_JOINT_RIGHT_COLLAR_BD, XR_BODY_JOINT_RIGHT_SHOULDER_BD},
                {XR_BODY_JOINT_RIGHT_SHOULDER_BD, XR_BODY_JOINT_RIGHT_ELBOW_BD},
                {XR_BODY_JOINT_RIGHT_ELBOW_BD, XR_BODY_JOINT_RIGHT_WRIST_BD},
                {XR_BODY_JOINT_RIGHT_WRIST_BD, XR_BODY_JOINT_RIGHT_HAND_BD},
            }};

        for (const auto& [fromJoint, toJoint] : bodyBones) {
          if (!bodyJointValid(fromJoint) || !bodyJointValid(toJoint)) continue;
          appendBodyBone(
              m_p4uBodyJoints[fromJoint].pose.position,
              m_p4uBodyJoints[toJoint].pose.position,
              0.0042f);
        }

        for (int jointIndex = 0; jointIndex < XR_BODY_JOINT_COUNT_BD; ++jointIndex) {
          const auto joint = static_cast<XrBodyJointBD>(jointIndex);
          if (!bodyJointValid(joint)) continue;
          appendBodyJoint(m_p4uBodyJoints[joint].pose.position, 0.0075f);
        }
      }
    }

    // Render view to the appropriate part of the swapchain image.
]==])

_p4u_replace_if_missing(
    "motion tracker body skeleton build v21"
    "P4U v21: optional Motion Tracker full-body debug skeleton"
    "${_body_skeleton_build_anchor}"
    "${_body_skeleton_build_replacement}"
)

set(_body_skeleton_render_anchor [==[
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

set(_body_skeleton_render_replacement [==[
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

      if (bodySkeletonVisible &&
          !bodySkeletonVerts.empty() &&
          !bodySkeletonIndices.empty()) {
        XrPosef bodyWorldPose{};
        bodyWorldPose.orientation.w = 1.0f;
        m_graphicsPlugin->RenderUserMesh(
            projectionLayerViews[i],
            swapchainImage,
            m_colorSwapchainFormat,
            bodySkeletonVerts.data(),
            static_cast<uint32_t>(bodySkeletonVerts.size()),
            bodySkeletonIndices.data(),
            static_cast<uint32_t>(bodySkeletonIndices.size()),
            bodyWorldPose);
      }
]==])

_p4u_replace_if_missing(
    "motion tracker body skeleton render v21"
    "if (bodySkeletonVisible &&"
    "${_body_skeleton_render_anchor}"
    "${_body_skeleton_render_replacement}"
)

file(WRITE "${_p4u_openxr_program}" "${_p4u_openxr_source}")
message(STATUS "Applied PICO 4 Ultra OpenXR input patch")