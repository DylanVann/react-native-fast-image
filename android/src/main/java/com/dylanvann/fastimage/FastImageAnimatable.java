package com.dylanvann.fastimage;

// An animated image that applies FastImage's loop and paused itself (an APNG,
// FastImageApngRenderer). The view's target starts it when it's shown.
interface FastImageAnimatable {
    // loopCount as FastImageViewWithUrl has it: -1, as many times as the file
    // says; 0, forever; n, n times. restart: play it again from its first
    // frame.
    void setLoopCount(int loopCount, boolean restart);

    // Stays on the frame it's showing; false continues from there.
    void setPaused(boolean paused);
}
