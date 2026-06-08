#include "freedeck/engine.h"
#include <chrono>
#include <iostream>
#include <thread>

int main(int argc, char* argv[]) {
    if (argc < 3) {
        std::cerr << "Usage: freedeck_console_test <deck_a_file> <deck_b_file>\n";
        return 1;
    }

    auto engine = freedeck::new_engine();
    if (!engine->start_audio()) {
        std::cerr << "Failed to start audio device.\n";
        return 1;
    }

    if (!engine->load_track(0, argv[1])) {
        std::cerr << "Failed to load deck A: " << argv[1] << "\n";
        return 1;
    }

    if (!engine->load_track(1, argv[2])) {
        std::cerr << "Failed to load deck B: " << argv[2] << "\n";
        return 1;
    }

    std::cout << "Loaded tracks. Playing both decks for 15 seconds...\n";
    engine->set_play(0, true);
    engine->set_play(1, true);
    engine->set_crossfader(0.0f);

    for (int i = 0; i < 15; ++i) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        const auto levels = engine->output_levels();
        std::cout << "t=" << i + 1 << "s  posA=" << engine->position_seconds(0)
                  << " posB=" << engine->position_seconds(1)
                  << " levels L=" << levels.left << " R=" << levels.right << "\n";
    }

    engine->set_play(0, false);
    engine->set_play(1, false);
    engine->stop_audio();
    std::cout << "Done.\n";
    return 0;
}
