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
    // Resolve product pointer/activation input from both sources every frame. PICO OS may
    // keep a stale/idle controller action pose valid while the user is actually using hands,
    // so an active XR_EXT_hand_tracking result must be allowed to override that pose.
    // P4U: active hand tracking overrides stale controller pose.
    std::array<XrVector3f*, 2> handDeltas{};
    std::array<std::optional<XrPosef>, 2> handPoses{};
    bool buttonPressed = false;
    for (auto hand : {Side::LEFT, Side::RIGHT}) {
      std::optional<XrPosef> resolvedPose;

      XrSpaceLocation spaceLocation{XR_TYPE_SPACE_LOCATION};
      res = xrLocateSpace(m_input.handSpace[hand], m_appSpace, predictedDisplayTime, &spaceLocation);
      CHECK_XRRESULT(res, "xrLocateSpace");
      if (XR_UNQUALIFIED_SUCCESS(res) &&
          (spaceLocation.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) != 0 &&
          (spaceLocation.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT) != 0) {
        resolvedPose = spaceLocation.pose;
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

        if (directActive) {
          resolvedPose = palm.pose;
          m_input.handActive[hand] = XR_TRUE;

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
          m_input.handToggle[hand] =
              pinched ? InputState::PRESS_DOWN : InputState::RELEASE;

          const float pinchValue =
              std::min(1.0f, std::max(0.0f, (0.060f - pinchDistance) / 0.040f));
          m_input.handScale[hand] = 1.0f - 0.5f * pinchValue;

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

_p4u_replace_if_missing(
    "direct hand source priority v2"
    "P4U: active hand tracking overrides stale controller pose"
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

_p4u_replace_if_missing(
    "direct hand source priority reset v2"
    "P4U: active hand tracking overrides stale controller pose"
    "${_direct_hand_priority_reset_old}"
    "${_direct_hand_priority_reset_new}"
)

set(_direct_hand_priority_condition_old [==[
      if (!resolvedPose && m_handTrackingSupported &&
]==])

set(_direct_hand_priority_condition_new [==[
      if (m_handTrackingSupported &&
]==])

_p4u_replace_if_missing(
    "direct hand source priority condition v2"
    "P4U: active hand tracking overrides stale controller pose"
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

file(WRITE "${_p4u_openxr_program}" "${_p4u_openxr_source}")
message(STATUS "Applied PICO 4 Ultra OpenXR input patch")
