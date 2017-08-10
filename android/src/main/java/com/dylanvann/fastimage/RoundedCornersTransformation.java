package com.dylanvann.fastimage;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.util.Log;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.Transformation;
import com.bumptech.glide.load.engine.Resource;
import com.bumptech.glide.load.engine.bitmap_recycle.BitmapPool;
import com.bumptech.glide.load.resource.bitmap.BitmapResource;

public class RoundedCornersTransformation implements Transformation<Bitmap> {

    private BitmapPool mBitmapPool;
    private float mRadius;

    public RoundedCornersTransformation(Context context, float radius) {
        this(Glide.get(context).getBitmapPool(), radius);
    }

    public RoundedCornersTransformation(BitmapPool pool, float radius) {
        mBitmapPool = pool;
        mRadius = radius;
    }

    @Override
    public Resource<Bitmap> transform(Resource<Bitmap> resource, int outWidth, int outHeight) {
        Bitmap source = resource.get();

        int width = source.getWidth();
        int height = source.getHeight();

        float ratio = (float)width / (float)outWidth;

        Bitmap bitmap = mBitmapPool.get(width, height, Bitmap.Config.ARGB_8888);
        if (bitmap == null) {
            bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        }

        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint();
        paint.setAntiAlias(true);
        paint.setShader(new BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        canvas.drawRoundRect(new RectF(0, 0, width, height), mRadius * ratio, mRadius * ratio, paint);
        return BitmapResource.obtain(bitmap, mBitmapPool);
    }

    @Override public String getId() {
        return "RoundedTransformation(radius=" + mRadius + ")";
    }

}
