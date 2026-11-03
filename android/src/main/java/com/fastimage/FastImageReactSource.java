package com.fastimage;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.ReadableType;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// A source from JS (the view's props, the module's functions), as
// FastImageSourceProps reads it.
final class FastImageReactSource {
    private FastImageReactSource() {
    }

    static FastImageSourceProps parse(ReadableMap map) {
        return FastImageSourceProps.parse(toMap(map));
    }

    // The array's entry as a source, or null for one that isn't an object.
    @Nullable
    static FastImageSourceProps parse(ReadableArray array, int index) {
        return array.getType(index) == ReadableType.Map ? parse(array.getMap(index)) : null;
    }

    private static Map<String, Object> toMap(ReadableMap map) {
        HashMap<String, Object> result = new HashMap<>();
        ReadableMapKeySetIterator keys = map.keySetIterator();
        while (keys.hasNextKey()) {
            String key = keys.nextKey();
            switch (map.getType(key)) {
                case Null:
                    result.put(key, null);
                    break;
                case Boolean:
                    result.put(key, map.getBoolean(key));
                    break;
                case Number:
                    result.put(key, map.getDouble(key));
                    break;
                case String:
                    result.put(key, map.getString(key));
                    break;
                case Map:
                    result.put(key, toMap(map.getMap(key)));
                    break;
                case Array:
                    result.put(key, toList(map.getArray(key)));
                    break;
            }
        }
        return result;
    }

    private static List<Object> toList(ReadableArray array) {
        List<Object> result = new ArrayList<>();
        for (int i = 0; i < array.size(); i++) {
            switch (array.getType(i)) {
                case Null:
                    result.add(null);
                    break;
                case Boolean:
                    result.add(array.getBoolean(i));
                    break;
                case Number:
                    result.add(array.getDouble(i));
                    break;
                case String:
                    result.add(array.getString(i));
                    break;
                case Map:
                    result.add(toMap(array.getMap(i)));
                    break;
                case Array:
                    result.add(toList(array.getArray(i)));
                    break;
            }
        }
        return result;
    }
}
