package com.dylanvann.fastimage.custom.persistence;

import io.objectbox.annotation.Entity;
import io.objectbox.annotation.Id;

@Entity
public class EntityEtagCache {
    @Id
    public long id;

    public String url;
    public String etag;
}
