cmake_minimum_required(VERSION 3.22)
project(freedeck_engine VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(JUCE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/../third_party/JUCE" CACHE PATH "Path to JUCE")
add_subdirectory(${JUCE_PATH} ${CMAKE_BINARY_DIR}/juce EXCLUDE_FROM_ALL)

include(FetchContent)
FetchContent_Declare(
    rubberband
    GIT_REPOSITORY https://github.com/breakfastquay/rubberband.git
    GIT_TAG v3.3.0
)
FetchContent_MakeAvailable(rubberband)

add_library(rubberband STATIC
    ${rubberband_SOURCE_DIR}/single/RubberBandSingle.cpp
)
target_include_directories(rubberband PUBLIC ${rubberband_SOURCE_DIR})

if(APPLE)
    target_link_libraries(rubberband PUBLIC "-framework Accelerate")
endif()

add_library(freedeck_engine STATIC
    src/Engine.cpp
    src/Deck.cpp
    src/Mixer.cpp
    src/Eq.cpp
    src/Filter.cpp
    src/Waveform.cpp
    src/TrackAnalysis.cpp
    src/TimeStretch.cpp
)

target_include_directories(freedeck_engine
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_compile_definitions(freedeck_engine
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_APPLICATION_NAME_STRING="FreeDeck"
        JUCE_APPLICATION_VERSION_STRING="${PROJECT_VERSION}"
        JUCE_MODAL_LOOPS_PERMITTED=1
)

option(FREEDECK_USE_AUBIO "Use Aubio for track analysis" OFF)

if(FREEDECK_USE_AUBIO)
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(AUBIO REQUIRED IMPORTED_TARGET aubio)
    target_compile_definitions(freedeck_engine PUBLIC FREEDECK_USE_AUBIO=1)
    target_link_libraries(freedeck_engine PUBLIC PkgConfig::AUBIO)
endif()

option(FREEDECK_USE_ESSENTIA "Use Essentia for track analysis" OFF)

if(FREEDECK_USE_ESSENTIA)
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(ESSENTIA REQUIRED IMPORTED_TARGET essentia)
    target_compile_definitions(freedeck_engine PUBLIC FREEDECK_USE_ESSENTIA=1)
    target_link_libraries(freedeck_engine PUBLIC PkgConfig::ESSENTIA)
endif()

target_link_libraries(freedeck_engine
    PUBLIC
        juce::juce_core
        juce::juce_events
        juce::juce_data_structures
        juce::juce_audio_basics
        juce::juce_audio_formats
        juce::juce_audio_devices
        juce::juce_dsp
    PRIVATE
        rubberband
)

add_executable(freedeck_console_test test/console_main.cpp)
target_link_libraries(freedeck_console_test PRIVATE freedeck_engine)

add_executable(freedeck_track_analysis_test test/track_analysis_test.cpp)
target_include_directories(freedeck_track_analysis_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(freedeck_track_analysis_test PRIVATE freedeck_engine juce::juce_events)

add_executable(freedeck_time_stretch_test test/time_stretch_test.cpp)
target_include_directories(freedeck_time_stretch_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(freedeck_time_stretch_test PRIVATE freedeck_engine juce::juce_events rubberband)

add_executable(freedeck_eq_test test/eq_test.cpp)
target_include_directories(freedeck_eq_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(freedeck_eq_test PRIVATE freedeck_engine juce::juce_events)

add_executable(freedeck_filter_test test/filter_test.cpp)
target_include_directories(freedeck_filter_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(freedeck_filter_test PRIVATE freedeck_engine juce::juce_events)

add_executable(freedeck_deck_audio_test test/deck_audio_test.cpp)
target_include_directories(freedeck_deck_audio_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(freedeck_deck_audio_test PRIVATE freedeck_engine juce::juce_events rubberband)

add_executable(freedeck_sync_test test/sync_test.cpp)
target_include_directories(freedeck_sync_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(freedeck_sync_test PRIVATE freedeck_engine juce::juce_events rubberband)

add_executable(freedeck_beatgrid_test test/beatgrid_test.cpp)
target_include_directories(freedeck_beatgrid_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(freedeck_beatgrid_test PRIVATE freedeck_engine juce::juce_events rubberband)

add_executable(freedeck_loop_test test/loop_test.cpp)
target_include_directories(freedeck_loop_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(freedeck_loop_test PRIVATE freedeck_engine juce::juce_events rubberband)

enable_testing()
add_test(NAME track_analysis_test COMMAND freedeck_track_analysis_test)
add_test(NAME sync_test COMMAND freedeck_sync_test)
add_test(NAME beatgrid_test COMMAND freedeck_beatgrid_test)
add_test(NAME loop_test COMMAND freedeck_loop_test)
add_test(NAME eq_test COMMAND freedeck_eq_test)
add_test(NAME filter_test COMMAND freedeck_filter_test)
add_test(NAME time_stretch_test COMMAND freedeck_time_stretch_test)
