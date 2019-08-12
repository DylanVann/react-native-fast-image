package com.bumptech.glide;

import android.graphics.drawable.Drawable;
import android.net.Uri;
import androidx.annotation.CheckResult;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import android.util.Log;
import android.view.View;

import com.bumptech.glide.load.model.GlideUrl;
import com.klarna.glide.fresco.R;

import kotlin.NotImplementedError;

import static com.bumptech.glide.util.Helpers.msg;

/**
 * @see <a href="https://github.com/bumptech/glide/blob/master/library/src/main/java/com/bumptech/glide/RequestManager.java">Original</a>
 */
public class RequestManager {

    private static final String TAG = "glide";
    /** Reference on root object that creates us. */
    private final Glide instance;

    /** Default constructor. */
    /* package */ RequestManager(@NonNull final Glide instance) {
        this.instance = instance;
    }

    /** Load Drawable from provided object: String, Uri, GlideUrl. */
    @NonNull
    @CheckResult
    public RequestBuilder<Drawable> load(@Nullable Object model) {
        // DONE: expected String, Uri or GlideUrl
        if (model instanceof String) {
            final Uri url = Uri.parse((String) model);

            return new RequestBuilder<>(this, url);
        } else if (model instanceof Uri) {
            return new RequestBuilder<>(this, (Uri) model);
        } else if (model instanceof GlideUrl) {
            final GlideUrl url = (GlideUrl) model;

            return load(url.toStringUrl());
        }

        throw new NotImplementedError();
    }

    /**
     * Cancel any pending loads Glide may have for the view and free any resources that may have been
     * loaded for the view.
     *
     * <p>Note that this will only work if {@link View#setTag(Object)} is not called on this view
     * outside of Glide.
     *
     * @param view The view to cancel loads and free resources for.
     * @throws IllegalArgumentException if an object other than Glide's metadata is put as the view's
     *                                  tag.
     */
    public void clear(@NonNull final View view) {
        Log.i(TAG, msg("clear loading for: " + view));

        final RequestBuilder.Holder holder = (RequestBuilder.Holder) view.getTag(R.id.tag_glide_fresco_holder);
        if (null == holder) return;

        holder.closeAll();
    }

}
