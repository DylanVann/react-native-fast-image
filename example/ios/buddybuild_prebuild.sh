#!/usr/bin/env bash

# Workaround for a yarn bug: https://github.com/yarnpkg/yarn/issues/685
echo "Removing duplicate node_modules, workaround for yarn bug."
rm -rf ../node_modules/react-native-fast-image/node_modules
