"use strict";

/*
 * 고덕이네 채용도구 Service Worker v2
 *
 * - API는 항상 네트워크
 * - HTML / JS / CSS는 network-first
 * - 이미지 / 폰트 등은 cache-first
 * - 이전 버전 캐시는 자동 삭제
 */

const CACHE_NAME =
  "job-searcher-shell-v2";

const STATIC_FILES = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];


/* =========================================================
   설치
========================================================= */

self.addEventListener(
  "install",
  (event) => {

    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then(async (cache) => {

          /*
           * 파일 하나가 없다고
           * SW 설치 자체가 실패하지 않게
           * 각각 따로 저장
           */

          await Promise.allSettled(
            STATIC_FILES.map(
              async (url) => {

                try {
                  await cache.add(url);
                } catch (error) {
                  console.warn(
                    "[SW] cache skip:",
                    url
                  );
                }

              }
            )
          );

        })
        .then(() =>
          self.skipWaiting()
        )
    );

  }
);


/* =========================================================
   활성화
========================================================= */

self.addEventListener(
  "activate",
  (event) => {

    event.waitUntil(
      caches
        .keys()
        .then((keys) => {

          return Promise.all(
            keys
              .filter(
                (key) =>
                  key !== CACHE_NAME
              )
              .map(
                (key) =>
                  caches.delete(key)
              )
          );

        })
        .then(() =>
          self.clients.claim()
        )
    );

  }
);


/* =========================================================
   fetch
========================================================= */

self.addEventListener(
  "fetch",
  (event) => {

    const request =
      event.request;

    if (
      request.method !== "GET"
    ) {
      return;
    }

    const url =
      new URL(request.url);


    /* -----------------------------------------------------
       API
       항상 네트워크
    ----------------------------------------------------- */

    if (
      url.pathname.startsWith(
        "/api/"
      )
    ) {
      return;
    }


    /*
     * 외부 사이트 요청은
     * 서비스워커에서 건드리지 않음
     */

    if (
      url.origin !==
      self.location.origin
    ) {
      return;
    }


    /* -----------------------------------------------------
       HTML / JS / CSS
       Network First

       새 버전이 있으면 무조건 새 파일 사용.
       인터넷이 안 될 때만 캐시 fallback.
    ----------------------------------------------------- */

    const isPage =
      request.mode ===
      "navigate";

    const isImportantAsset =
      url.pathname === "/" ||
      url.pathname.endsWith(
        ".html"
      ) ||
      url.pathname.endsWith(
        ".js"
      ) ||
      url.pathname.endsWith(
        ".css"
      );


    if (
      isPage ||
      isImportantAsset
    ) {

      event.respondWith(
        networkFirst(request)
      );

      return;
    }


    /* -----------------------------------------------------
       이미지 / 아이콘 / 폰트 / manifest
       Cache First
    ----------------------------------------------------- */

    event.respondWith(
      cacheFirst(request)
    );

  }
);


/* =========================================================
   Network First
========================================================= */

async function networkFirst(
  request
) {

  try {

    const response =
      await fetch(request, {
        cache: "no-store",
      });


    /*
     * 정상 응답이면 새 버전을
     * 캐시에 덮어쓴다.
     */

    if (
      response &&
      response.ok
    ) {

      const cache =
        await caches.open(
          CACHE_NAME
        );

      cache.put(
        request,
        response.clone()
      );

    }


    return response;

  } catch (error) {

    const cached =
      await caches.match(
        request
      );


    if (cached) {
      return cached;
    }


    /*
     * 페이지 탐색 중이라면
     * 루트 페이지라도 fallback
     */

    if (
      request.mode ===
      "navigate"
    ) {

      const fallback =
        await caches.match("/");

      if (fallback) {
        return fallback;
      }

    }


    throw error;

  }

}


/* =========================================================
   Cache First
========================================================= */

async function cacheFirst(
  request
) {

  const cached =
    await caches.match(
      request
    );


  if (cached) {
    return cached;
  }


  try {

    const response =
      await fetch(request);


    if (
      response &&
      response.ok
    ) {

      const cache =
        await caches.open(
          CACHE_NAME
        );

      cache.put(
        request,
        response.clone()
      );

    }


    return response;

  } catch (error) {

    throw error;

  }

}
