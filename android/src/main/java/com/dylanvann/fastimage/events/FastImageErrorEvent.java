package com.dylanvann.fastimage.events;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.Event;

public class FastImageErrorEvent extends Event<FastImageErrorEvent> {

  @Nullable
  private final ReadableMap mSource;

  public FastImageErrorEvent(int surfaceId, int viewTag, @Nullable ReadableMap source) {
    super(surfaceId, viewTag);
    mSource = source;
  }
  @NonNull
  @Override
  public String getEventName() {
    return "onFastImageError";
  }

  @Override
  protected WritableMap getEventData() {
    WritableMap eventData = Arguments.createMap();
    if (mSource != null) {
      eventData.putString("message", "Invalid source prop:" + mSource);
    }
    return eventData;
  }
}
