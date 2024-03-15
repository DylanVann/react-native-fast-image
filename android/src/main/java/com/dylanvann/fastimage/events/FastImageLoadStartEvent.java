package com.dylanvann.fastimage.events;

import androidx.annotation.NonNull;

import com.facebook.react.uimanager.events.Event;

public class FastImageLoadStartEvent extends Event<FastImageLoadStartEvent> {

  public FastImageLoadStartEvent(int surfaceId, int viewTag) {
    super(surfaceId, viewTag);
  }

  @NonNull
  @Override
  public String getEventName() {
    return "onFastImageLoadStart";
  }

}
