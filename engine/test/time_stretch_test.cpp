#include "TimeStretch.h"

#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>

#include <cassert>
#include <cmath>
#include <iostream>

namespace {

class SilentSource : public juce::AudioSource {
public:
    void prepareToPlay(int, double) override {}
    void releaseResources() override {}
    void getNextAudioBlock(const juce::AudioSourceChannelInfo& info) override {
        for (int ch = 0; ch < info.buffer->getNumChannels(); ++ch)
            info.buffer->clear(ch, info.startSample, info.numSamples);
    }
};

void test_dj_tempo_ratio_stored_as_set() {
    SilentSource silent;
    freedeck::TimeStretch stretch(&silent, false, 2);
    stretch.prepareToPlay(512, 44100.0);
    stretch.set_time_ratio(2.0);
    stretch.set_pitch_scale(1.0);
    assert(std::abs(stretch.get_time_ratio() - 2.0) < 0.001);
    std::cout << "test_dj_tempo_ratio_stored_as_set OK\n";
}

void test_higher_dj_ratio_consumes_more_input() {
    const auto measure = [](double dj_ratio) -> double {
        SilentSource silent;
        freedeck::TimeStretch stretch(&silent, false, 2);
        stretch.prepareToPlay(512, 44100.0);
        stretch.set_time_ratio(dj_ratio);
        stretch.set_pitch_scale(1.0);
        juce::AudioBuffer<float> buf(2, 512);
        juce::AudioSourceChannelInfo info(&buf, 0, 512);
        stretch.getNextAudioBlock(info);
        return stretch.input_samples_consumed_per_block(512);
    };

    const double at_half = measure(0.5);
    const double at_one = measure(1.0);
    const double at_two = measure(2.0);

    assert(at_two >= at_one);
    assert(at_half <= at_one);
    std::cout << "test_higher_dj_ratio_consumes_more_input OK\n";
}

} // namespace

int main() {
    juce::ScopedJuceInitialiser_GUI juce_init;
    test_dj_tempo_ratio_stored_as_set();
    test_higher_dj_ratio_consumes_more_input();
    std::cout << "All time stretch tests passed.\n";
    return 0;
}
