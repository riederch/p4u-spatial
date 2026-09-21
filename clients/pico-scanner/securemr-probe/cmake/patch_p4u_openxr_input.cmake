# Patch the pinned PICO SecureMR OpenXR sample with PICO 4 Ultra input support.
#
# The upstream sample only suggests generic controller profiles. PICO OS 5.15.9.U on the
# target PICO 4 Ultra reports /interaction_profiles/bytedance/pico4s_controller and requires
# XR_BD_controller_interaction for application-side bindings.
#
# Keep this patch narrow and fail hard when an expected upstream anchor changes.

set(_p4u_openxr_program "${pico_securemr_samples_SOURCE_DIR}/base/openxr_program.cpp")
file(READ "${_p4u_openxr_program}" _p4u_openxr_source)

function(_p4u_replace_once label needle replacement)
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

_p4u_replace_once(
    "instance extension capability probe"
    "${_capability_anchor}"
    "${_capability_replacement}"
)

set(_extension_anchor [==[
    extensions.push_back(XR_FB_DISPLAY_REFRESH_RATE_EXTENSION_NAME);
]==])

set(_extension_replacement [==[
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

_p4u_replace_once(
    "controller extension enable"
    "${_extension_anchor}"
    "${_extension_replacement}"
)

set(_binding_anchor [==[
    XrActionSpaceCreateInfo actionSpaceInfo{XR_TYPE_ACTION_SPACE_CREATE_INFO};
]==])

set(_binding_replacement [==[
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

_p4u_replace_once(
    "PICO 4S interaction profile bindings"
    "${_binding_anchor}"
    "${_binding_replacement}"
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

_p4u_replace_once(
    "input capability state"
    "${_member_anchor}"
    "${_member_replacement}"
)

file(WRITE "${_p4u_openxr_program}" "${_p4u_openxr_source}")
message(STATUS "Applied PICO 4 Ultra OpenXR input patch")
