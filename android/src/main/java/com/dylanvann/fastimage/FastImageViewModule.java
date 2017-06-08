package com.dylanvann.fastimage;

import android.app.Activity;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.engine.DiskCacheStrategy;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class FastImageViewModule extends ReactContextBaseJavaModule {
	public FastImageViewModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "FastImageView";
  }
  
  @ReactMethod
  public void prefetch(final ReadableArray urls) {
    final Activity activity = getCurrentActivity();
    activity.runOnUiThread(new Runnable() {
      @Override
      public void run() {
        for (int i = 0; i < urls.size(); i++) {
          Glide
            .with(activity.getApplicationContext())
            .load(urls.getString(i))
            .diskCacheStrategy(DiskCacheStrategy.SOURCE)
            .preload();
        }
      }
    });
  }
}
