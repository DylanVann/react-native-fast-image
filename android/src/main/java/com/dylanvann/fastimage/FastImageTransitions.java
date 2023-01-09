package com.dylanvann.fastimage;

import com.bumptech.glide.request.transition.ViewPropertyTransition.Animator;
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions;
import com.bumptech.glide.TransitionOptions;
import com.bumptech.glide.GenericTransitionOptions;
import com.facebook.react.bridge.JSApplicationIllegalArgumentException;
import android.view.View;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.view.animation.DecelerateInterpolator;

public class FastImageTransitions {
    static final DecelerateInterpolator mInterpolator = new DecelerateInterpolator();

    public static TransitionOptions getEnterTransition(FastImageEnterTransition transition, int duration) {
        switch (transition) {
            case FADE_IN:
                return DrawableTransitionOptions.withCrossFade(duration);
              
            case FLIP_LEFT:
                return GenericTransitionOptions.with(getHorizontalTransition(duration, -90f, 0f));

            case FLIP_RIGHT:
                return GenericTransitionOptions.with(getHorizontalTransition(duration, 90f, 0));
              
            case FLIP_BOTTOM:
                return GenericTransitionOptions.with(getVerticalTransition(duration, 90f, 0f));

            case FLIP_TOP:
                return GenericTransitionOptions.with(getVerticalTransition(duration, -90f, 0));

            default:
                throw new JSApplicationIllegalArgumentException("FastImage, invalid enterTransition argument");
        }
    }
 
    private static Animator getVerticalTransition(int duration, float start, float end) {
        Animator animationObject = new Animator() {  
            @Override
            public void animate(View view) {
                PropertyValuesHolder pvhRotation = PropertyValuesHolder.ofFloat("rotationX", start, end);
                PropertyValuesHolder pvhScale = PropertyValuesHolder.ofFloat("scaleX", 0.7f, 1f);
                ObjectAnimator transition = ObjectAnimator.ofPropertyValuesHolder(view, pvhRotation, pvhScale);

                transition.setDuration(duration);
                transition.setInterpolator(mInterpolator);
                transition.start();
            }
        };

        return animationObject;
    }

    private static Animator getHorizontalTransition(int duration, float start, float end) {
        Animator animationObject = new Animator() {  
            @Override
            public void animate(View view) {
                PropertyValuesHolder pvhRotation = PropertyValuesHolder.ofFloat("rotationY", start, end);
                PropertyValuesHolder pvhScale = PropertyValuesHolder.ofFloat("scaleY", 0.7f, 1f);
                ObjectAnimator transition = ObjectAnimator.ofPropertyValuesHolder(view, pvhRotation, pvhScale);

                transition.setDuration(duration);
                transition.setInterpolator(mInterpolator);
                transition.start();
            }
        };

        return animationObject;
    }
}