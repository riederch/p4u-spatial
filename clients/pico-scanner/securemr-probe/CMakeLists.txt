cmake_minimum_required(VERSION 3.22)
project(securemrprobe)

include(FetchContent)

# Pin the official PICO SecureMR sample source used for the OS 5.15.x compatibility probe.
FetchContent_Declare(
    pico_securemr_samples
    URL https://github.com/Pico-Developer/SecureMR-Samples/archive/02f7172b2cbddf0c31a9bda2b23df0f06b7b5a0b.tar.gz
)
FetchContent_GetProperties(pico_securemr_samples)
if(NOT pico_securemr_samples_POPULATED)
    FetchContent_Populate(pico_securemr_samples)
endif()

# Force verbose logging in the pinned official sample for the hardware compatibility probe.
set(_logger_file "${pico_securemr_samples_SOURCE_DIR}/base/oxr_utils/logger.cpp")
file(READ "${_logger_file}" _logger_source)
string(REPLACE
    "Log::Level g_minSeverity{Log::Level::Info};"
    "Log::Level g_minSeverity{Log::Level::Verbose};"
    _logger_source
    "${_logger_source}"
)
file(WRITE "${_logger_file}" "${_logger_source}")

set(SAMPLE_SRCS
    ${CMAKE_CURRENT_LIST_DIR}/cpp/readback_qr.cpp
    ${pico_securemr_samples_SOURCE_DIR}/samples/readback/cpp/readback_vulkan.cpp
    ${pico_securemr_samples_SOURCE_DIR}/samples/readback/cpp/readback_opengl.cpp
)
set(SAMPLE_DIR ${pico_securemr_samples_SOURCE_DIR}/samples/readback/cpp)
set(USE_SECURE_MR_UTILS ON)
set(THIRD_PARTY_DIRS ${pico_securemr_samples_SOURCE_DIR}/samples/readback/third_party)

include(${pico_securemr_samples_SOURCE_DIR}/base/base.cmake)
