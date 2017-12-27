import * as React from 'react';
import { ObjectOverwrite } from 'typelevel-ts';
import { ImageProperties, ImageStatic } from 'react-native';

declare namespace FastImage {

  export namespace priority {
    type low = 'low';
    type normal = 'normal';
    type high = 'high';
  }

  type priority =
    FastImage.priority.low |
    FastImage.priority.normal |
    FastImage.priority.high;

  export namespace resizeMode {
    type contain = 'contain';
    type cover = 'cover';
    type stretch = 'stretch';
    type center = 'center';
  }

  export type resizeMode =
    FastImage.resizeMode.contain |
    FastImage.resizeMode.cover |
    FastImage.resizeMode.stretch |
    FastImage.resizeMode.center
}

export type FastImageSource = {
  uri?: string,
  headers?: object;
  priority?: FastImage.priority;
};

export type FastImageProperties = ObjectOverwrite<ImageProperties, {
  source: FastImageSource | number,
  resizeMode?: FastImage.resizeMode;
  onLoadStart?(): void;
  onprogress?(event: any): void;
  onLoad?(): void;
  onError?(): void;
  onLoadEnd?(): void;
}>;

interface FastImageStatic extends React.ComponentClass<FastImageProperties> {
  resizeMode: FastImage.resizeMode;
  preload(sources: Array<FastImageProperties['source']>): void;
}

declare var FastImage: FastImageStatic;
type FastImage = FastImageStatic;

export default FastImage;
