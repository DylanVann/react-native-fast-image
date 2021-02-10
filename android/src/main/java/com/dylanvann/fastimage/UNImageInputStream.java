package com.dylanvann.fastimage;

import java.io.InputStream;

public class UNImageInputStream {
    public InputStream stream;

    public UNImageInputStream(InputStream stream) {
        this.stream = stream;
    }

    @Override
    public String toString() {
        return "UNImageInputStream: " + stream;
    }
}

