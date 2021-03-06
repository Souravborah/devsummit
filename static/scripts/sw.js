/**
 *
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

/* global importScripts, cacheManifest */
importScripts('{{ "/devsummit/static/scripts/cache-manifest.js" | add_hash }}');

const NAME = 'CDS';
const VERSION = '{{ version }}';

self.oninstall = evt => {
  const urls = cacheManifest.map(url => {
    return new Request(url, {credentials: 'include'});
  });

  evt.waitUntil(
    caches
      .open(NAME + '-v' + VERSION)
      .then(cache => {
        return cache.addAll(urls);
      }));

  self.skipWaiting();
};

self.onactivate = _ => {
  const currentCacheName = NAME + '-v' + VERSION;
  caches.keys().then(cacheNames => {
    return Promise.all(
      cacheNames.map(cacheName => {
        if (cacheName.indexOf(NAME) === -1) {
          return null;
        }

        if (cacheName !== currentCacheName) {
          return caches.delete(cacheName);
        }

        return null;
      })
    );
  });

  self.clients.claim();
};

self.onmessage = evt => {
  if (evt.data === 'version') {
    evt.source.postMessage({
      version: VERSION
    });
  }
};

self.onfetch = evt => {
  const remapRequestIfNeeded = request => {
    return new Promise((resolve, reject) => {
      if (request.url.endsWith('@1x.jpg')) {
        return resolve(request.url.replace(/@1x\.jpg/, '@1.5x.jpg'));
      }

      if (!request.url.endsWith('/devsummit/')) {
        return resolve(request);
      }

      caches.match('/devsummit/static/json/sessions.json')
          .then(sessions => sessions.json())
          .then(sessions => {
            const DAY_LENGTH_MS = 86400000;   // 24 hours
            const PST_ADJUSTMENT = 25200000;  // 7 hours
            const today = Date.now();

            Object.keys(sessions).forEach((day, index) => {
              // Date.parse of 2016-11-10 will assume UTC, which is good here.
              const confDay = Date.parse(day);
              const normalizedConfDay =
                  (today - confDay - PST_ADJUSTMENT) / DAY_LENGTH_MS;

              // If the value is between 0 and 1, then we're on the day of the
              // conference. Worth noting that we're adjusting by PST to ensure
              // that we don't switch days based on midnight UTC but rather PST.
              if (normalizedConfDay > 0 && normalizedConfDay < 1) {
                if (index === 0) {
                  resolve('/devsummit/live-day-1');
                } else if (index === 1) {
                  resolve('/devsummit/live-day-2');
                }
              }
            });

            resolve('/devsummit/home');
          })
          .catch(_ => {
            // On failure to get the sessions info, just fall back to the
            // standard home page.
            resolve('/devsummit/home');
          });
    });
  };

  evt.respondWith(
    remapRequestIfNeeded(evt.request)
      .then(request => caches.match(request))
      .then(response => {
        if (response) {
          return response;
        }

        // TODO(paullewis): ensure that requests going to google-analytics.com
        // are fetched only.
        return fetch(evt.request);
      })
  );
};
