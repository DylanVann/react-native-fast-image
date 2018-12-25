package com.dylanvann.fastimage;

import android.graphics.Bitmap;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.support.v7.graphics.Palette;

import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.ImageViewTarget;
import com.bumptech.glide.request.target.Target;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.events.RCTEventEmitter;

public class FastImageRequestListener implements RequestListener<Drawable> {
    static final String REACT_ON_ERROR_EVENT = "onFastImageError";
    static final String REACT_ON_LOAD_EVENT = "onFastImageLoad";
    static final String REACT_ON_LOAD_END_EVENT = "onFastImageLoadEnd";

    private String key;

    FastImageRequestListener(String key) {
        this.key = key;
    }


    private static WritableMap mapFromResourceWithPalette(Drawable resource, Palette palette) {
        WritableNativeMap swatchMap = new WritableNativeMap();

        addHexStringIfSwatchValid(palette.getDominantSwatch(), swatchMap, "dominantSwatch");
        addHexStringIfSwatchValid(palette.getLightVibrantSwatch(), swatchMap, "lightVibrantSwatch");
        addHexStringIfSwatchValid(palette.getVibrantSwatch(), swatchMap, "vibrantSwatch");
        addHexStringIfSwatchValid(palette.getDarkVibrantSwatch(), swatchMap, "darkVibrantSwatch");

        addHexStringIfSwatchValid(palette.getLightMutedSwatch(), swatchMap, "lightMutedSwatch");
        addHexStringIfSwatchValid(palette.getMutedSwatch(), swatchMap, "mutedSwatch");
        addHexStringIfSwatchValid(palette.getDarkMutedSwatch(), swatchMap, "darkMutedSwatch");


        WritableMap resourceData = mapFromResource(resource);

        resourceData.putMap("swatches", swatchMap);

        return resourceData;
    }


    private static WritableMap mapFromResource(Drawable resource) {
        WritableMap resourceData = new WritableNativeMap();
        resourceData.putInt("width", resource.getIntrinsicWidth());
        resourceData.putInt("height", resource.getIntrinsicHeight());

        return resourceData;
    }


    private static void addHexStringIfSwatchValid(Palette.Swatch swatch, WritableMap map, String key) {
        if (swatch != null) {


            WritableMap resourceData = new WritableNativeMap();
            resourceData.putString("rgba", specialRNColorConverter(swatch.getRgb()));
            resourceData.putString("titleTextColor", specialRNColorConverter(swatch.getTitleTextColor()));
            resourceData.putString("bodyTextColor", specialRNColorConverter(swatch.getBodyTextColor()));

            WritableArray hslArray = new WritableNativeArray();
            for (float hslItem : swatch.getHsl()) {
                hslArray.pushDouble(hslItem);
            }

            resourceData.putArray("hsl", hslArray);

            map.putMap(key, resourceData);
        }
    }

    private static String specialRNColorConverter(int rgb) {
        String hexValue = Integer.toHexString(rgb);
        String rgba = hexValue.substring(2) + hexValue.substring(0, 2);

        return new StringBuilder("#").append(rgba).toString();
    }

    @Override
    public boolean onLoadFailed(@android.support.annotation.Nullable GlideException e, Object model, Target<Drawable> target, boolean isFirstResource) {
        FastImageOkHttpProgressGlideModule.forget(key);
        if (!(target instanceof ImageViewTarget)) {
            return false;
        }
        FastImageViewWithUrl view = (FastImageViewWithUrl) ((ImageViewTarget) target).getView();
        ThemedReactContext context = (ThemedReactContext) view.getContext();
        RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
        int viewId = view.getId();
        eventEmitter.receiveEvent(viewId, REACT_ON_ERROR_EVENT, new WritableNativeMap());
        eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_END_EVENT, new WritableNativeMap());
        return false;
    }

    @Override
    public boolean onResourceReady(final Drawable resource, Object model, Target<Drawable> target, DataSource dataSource, boolean isFirstResource) {
        if (!(target instanceof ImageViewTarget)) {
            return false;
        }
        FastImageViewWithUrl view = (FastImageViewWithUrl) ((ImageViewTarget) target).getView();
        ThemedReactContext context = (ThemedReactContext) view.getContext();
        final RCTEventEmitter eventEmitter = context.getJSModule(RCTEventEmitter.class);
        final int viewId = view.getId();


        if (resource instanceof BitmapDrawable) {
            BitmapDrawable bd = (BitmapDrawable) resource;
            Bitmap bitmap = bd.getBitmap();
            Palette.from(bitmap).generate(new Palette.PaletteAsyncListener() {
                public void onGenerated(Palette palette) {
                    eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_EVENT, mapFromResourceWithPalette(resource, palette));
                }
            });
        } else {
            eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_EVENT, mapFromResource(resource));
        }


        eventEmitter.receiveEvent(viewId, REACT_ON_LOAD_END_EVENT, new WritableNativeMap());
        return false;
    }
}
