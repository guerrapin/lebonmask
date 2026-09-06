// ==UserScript==
// @name         Leboncoin Hide Ads
// @namespace    lbc-hide-ads
// @version      0.6.0
// @description  Hide Leboncoin ads persistently
// @match        https://www.leboncoin.fr/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    const LOG_PREFIX = '[LBC Hide]';
    const STORAGE_KEY = 'hiddenAds';
    const OBSERVER_DEBOUNCE_MS = 150;

    let showHiddenAds = false;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    let hiddenAds = GM_getValue(STORAGE_KEY, {});

    function saveHiddenAds() {
        GM_setValue(STORAGE_KEY, hiddenAds);
    }

    function isAdHidden(adId) {
        return Boolean(hiddenAds[adId]);
    }

    function persistHiddenAd(ad) {
        hiddenAds[ad.adId] = {
            title: ad.title,
            url: ad.url,
            hiddenAt: new Date().toISOString(),
        };

        saveHiddenAds();

        console.log(
            `${LOG_PREFIX} Hidden ad ${ad.adId}`
        );
    }

    // -------------------------------------------------------------------------
    // Ad detection
    // -------------------------------------------------------------------------

    function getAdIdFromUrl(url) {
        try {
            const parsedUrl = new URL(
                url,
                window.location.origin
            );

            const match = parsedUrl.pathname.match(
                /^\/ad\/[^/]+\/(\d+)\/?$/
            );

            return match ? match[1] : null;
        } catch {
            return null;
        }
    }

    function findAdCards() {
        /*
         * We rely on Leboncoin's data-qa-id rather than generated
         * CSS classes.
         *
         * We then go back up to the semantic <article>.
         */
        const containers = document.querySelectorAll(
            '[data-qa-id="aditem_container"]'
        );

        const cards = new Set();

        for (const container of containers) {
            const article = container.closest('article');

            if (article) {
                cards.add(article);
            }
        }

        return [...cards];
    }

    function getMainAdLink(card) {
        return (
            card.querySelector(
                'a[aria-label="Voir l’annonce"][href*="/ad/"]'
            ) ??
            card.querySelector(
                'a[href*="/ad/"]'
            )
        );
    }

    function getAdTitle(card) {
        const articleLabel = card
            .getAttribute('aria-label')
            ?.trim();

        if (articleLabel) {
            return articleLabel;
        }

        return (
            card
                .querySelector('p[aria-label]')
                ?.getAttribute('aria-label')
                ?.trim()
            ?? null
        );
    }

    function getAdFromCard(card) {
        const link = getMainAdLink(card);

        if (!link) {
            return null;
        }

        const adId = getAdIdFromUrl(link.href);

        if (!adId) {
            return null;
        }

        return {
            adId,
            title: getAdTitle(card),
            url: link.href,
            card,
            link,
        };
    }

    function findAds() {
        const ads = [];
        const seenIds = new Set();

        for (const card of findAdCards()) {
            const ad = getAdFromCard(card);

            if (!ad || seenIds.has(ad.adId)) {
                continue;
            }

            seenIds.add(ad.adId);
            ads.push(ad);
        }

        return ads;
    }

    // -------------------------------------------------------------------------
    // Visibility
    // -------------------------------------------------------------------------

    function setAdVisibility(ad, hidden) {
        if (!hidden) {
            ad.card.style.display = '';
            delete ad.card.dataset.lbcHidden;
            return;
        }

        ad.card.dataset.lbcHidden = 'true';

        ad.card.style.display =
            showHiddenAds
                ? ''
                : 'none';
    }

    // -------------------------------------------------------------------------
    // Action button
    // -------------------------------------------------------------------------

    function createActionButton(card) {
        if (getComputedStyle(card).position === 'static') {
            card.style.position = 'relative';
        }

        const button = document.createElement('button');

        button.className =
            'lbc-hide-ui lbc-hide-action';

        button.type = 'button';

        Object.assign(button.style, {
            position: 'absolute',
            top: '8px',
            left: '8px',
            zIndex: '10000',

            padding: '5px 8px',

            border: '1px solid #888',
            borderRadius: '6px',

            background: 'rgba(255, 255, 255, 0.95)',
            color: '#333',

            fontSize: '12px',
            fontFamily: 'sans-serif',
            fontWeight: '600',

            cursor: 'pointer',
            pointerEvents: 'auto',
        });

        button.addEventListener(
            'mousedown',
            event => {
                event.preventDefault();
                event.stopPropagation();
            }
        );

        button.addEventListener(
            'click',
            event => {
                event.preventDefault();
                event.stopPropagation();

                /*
                 * Resolve the ad at click time rather than keeping
                 * an old ad object in a closure.
                 *
                 * This makes the button safer if Leboncoin ever
                 * reuses a card DOM node for another ad.
                 */
                const currentAd =
                    getAdFromCard(card);

                if (!currentAd) {
                    return;
                }

                if (isAdHidden(currentAd.adId)) {
                    restoreAd(currentAd.adId);
                } else {
                    hideAd(currentAd);
                }
            }
        );

        card.appendChild(button);

        return button;
    }

    function getActionButton(card) {
        return card.querySelector(
            ':scope > .lbc-hide-action'
        );
    }

    function removeActionButton(card) {
        getActionButton(card)?.remove();
    }

    function updateActionButton(ad) {
        const hidden = isAdHidden(ad.adId);

        /*
         * If the ad is hidden and hidden ads are not currently
         * displayed, no action button is needed.
         */
        if (hidden && !showHiddenAds) {
            removeActionButton(ad.card);
            return;
        }

        const button =
            getActionButton(ad.card) ??
            createActionButton(ad.card);

        if (hidden) {
            button.textContent = '↩ Restaurer';
            button.title =
                'Restaurer cette annonce';
        } else {
            button.textContent = '✕ Masquer';
            button.title =
                'Masquer cette annonce';
        }
    }

    // -------------------------------------------------------------------------
    // Hide / restore
    // -------------------------------------------------------------------------

    function hideAd(ad) {
        persistHiddenAd(ad);

        processAds();
    }

    function restoreAd(adId) {
        if (!hiddenAds[adId]) {
            console.log(
                `${LOG_PREFIX} Ad ${adId} is not hidden`
            );

            return;
        }

        delete hiddenAds[adId];
        saveHiddenAds();

        console.log(
            `${LOG_PREFIX} Restored ad ${adId}`
        );

        /*
         * No reload required anymore.
         */
        processAds();
    }

    function restoreAll() {
        hiddenAds = {};
        saveHiddenAds();

        showHiddenAds = false;

        console.log(
            `${LOG_PREFIX} All hidden ads restored`
        );

        processAds();
    }

    // -------------------------------------------------------------------------
    // Results header
    // -------------------------------------------------------------------------

    function matchesResultsHeader(element) {
        return /^\s*\d[\d\s\u00a0]*\s+annonces?\b/i.test(
            element.textContent
        );
    }

    function findResultsHeader() {
        /*
         * Preferred selector based on the current Leboncoin DOM.
         */
        const preferred = [
            ...document.querySelectorAll(
                'div.text-subhead.text-neutral[aria-hidden="true"]'
            )
        ].find(matchesResultsHeader);

        if (preferred) {
            return preferred;
        }

        /*
         * Fallback in case the styling classes change.
         */
        return [
            ...document.querySelectorAll(
                'div[aria-hidden="true"]'
            )
        ].find(matchesResultsHeader) ?? null;
    }

    function createHeaderControls(header) {
        let controls = header.querySelector(
            ':scope > .lbc-hide-header-controls'
        );

        if (controls) {
            return controls;
        }

        controls = document.createElement('span');

        controls.className =
            'lbc-hide-ui lbc-hide-header-controls';

        controls.style.marginLeft = '6px';

        const count = document.createElement('span');

        count.className = 'lbc-hide-count';

        controls.appendChild(count);

        const toggle = document.createElement('button');

        toggle.className =
            'lbc-hide-ui lbc-hide-toggle';

        toggle.type = 'button';

        Object.assign(toggle.style, {
            marginLeft: '8px',
            padding: '2px 6px',

            border: 'none',
            background: 'transparent',

            color: 'inherit',
            font: 'inherit',
            fontWeight: '600',

            textDecoration: 'underline',
            cursor: 'pointer',
        });

        toggle.addEventListener(
            'click',
            event => {
                event.preventDefault();
                event.stopPropagation();

                showHiddenAds = !showHiddenAds;

                processAds();
            }
        );

        controls.appendChild(toggle);
        header.appendChild(controls);

        return controls;
    }

    function updateResultsHeader(ads) {
        const header = findResultsHeader();

        if (!header) {
            return;
        }

        const hiddenCount = ads.filter(
            ad => isAdHidden(ad.adId)
        ).length;

        let controls = header.querySelector(
            ':scope > .lbc-hide-header-controls'
        );

        /*
     * No hidden ads:
     * remove our UI entirely instead of keeping hidden/stale controls.
     */
        if (hiddenCount === 0) {
            controls?.remove();
            return;
        }

        /*
     * Hidden ads exist:
     * create the controls again if necessary.
     */
        controls =
            controls ??
            createHeaderControls(header);

        const count = controls.querySelector(
            '.lbc-hide-count'
        );

        const toggle = controls.querySelector(
            '.lbc-hide-toggle'
        );

        count.textContent =
            ` · ${hiddenCount} masquée${
        hiddenCount > 1 ? 's' : ''
    }`;

        toggle.textContent =
            showHiddenAds
            ? 'Masquer à nouveau'
        : 'Afficher';
    }

    // -------------------------------------------------------------------------
    // Processing
    // -------------------------------------------------------------------------

    function processAd(ad) {
        const hidden = isAdHidden(ad.adId);

        setAdVisibility(ad, hidden);
        updateActionButton(ad);

        /*
         * Useful for inspection/debugging.
         */
        ad.card.dataset.lbcAdId = ad.adId;
    }

    function processAds() {
        const ads = findAds();

        const hiddenCount = ads.filter(
            ad => isAdHidden(ad.adId)
        ).length;

        /*
     * Temporary display mode only makes sense while there are
     * hidden ads in the current search.
     */
        if (hiddenCount === 0) {
            showHiddenAds = false;
        }

        for (const ad of ads) {
            processAd(ad);
        }

        updateResultsHeader(ads);

        return ads;
    }

    // -------------------------------------------------------------------------
    // Mutation observer
    // -------------------------------------------------------------------------

    let debounceTimer = null;

    function scheduleProcessAds() {
        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(
            processAds,
            OBSERVER_DEBOUNCE_MS
        );
    }

    function isElement(node) {
        return node?.nodeType === 1;
    }

    function isOurUiNode(node) {
        return (
            isElement(node) &&
            (
                node.classList.contains('lbc-hide-ui') ||
                Boolean(
                    node.closest?.('.lbc-hide-ui')
                )
            )
        );
    }

    const RELEVANT_SELECTOR = [
        'article',
        '[data-qa-id="aditem_container"]',
        'a[href*="/ad/"]',
        'div.text-subhead.text-neutral[aria-hidden="true"]',
    ].join(',');

    function nodeMayAffectResults(node) {
        if (!isElement(node)) {
            return false;
        }

        return (
            node.matches(RELEVANT_SELECTOR) ||
            Boolean(
                node.querySelector(RELEVANT_SELECTOR)
            )
        );
    }

    function isRelevantMutation(mutation) {
        /*
         * If Leboncoin ever reuses a card and changes its URL,
         * make sure we process the new ad ID.
         */
        if (mutation.type === 'attributes') {
            return (
                isElement(mutation.target) &&
                mutation.target.matches(
                    'a[href*="/ad/"]'
                ) &&
                Boolean(
                    mutation.target.closest(
                        'article'
                    )
                )
            );
        }

        if (mutation.type !== 'childList') {
            return false;
        }

        /*
         * Ignore mutations inside our own controls.
         */
        if (
            isElement(mutation.target) &&
            mutation.target.closest(
                '.lbc-hide-ui'
            )
        ) {
            return false;
        }

        const changedNodes = [
            ...mutation.addedNodes,
            ...mutation.removedNodes,
        ];

        /*
         * Adding/removing our own button should not trigger
         * another processAds().
         */
        if (
            changedNodes.length > 0 &&
            changedNodes.every(isOurUiNode)
        ) {
            return false;
        }

        /*
         * Detect whole result blocks/cards being inserted
         * or removed.
         */
        if (
            changedNodes.some(nodeMayAffectResults)
        ) {
            return true;
        }

        /*
         * The native "81 annonces" text may itself change.
         */
        return (
            isElement(mutation.target) &&
            mutation.target.matches(
                'div.text-subhead.text-neutral[aria-hidden="true"]'
            )
        );
    }

    function startObserver() {
        const observer = new MutationObserver(
            mutations => {
                if (
                    mutations.some(
                        isRelevantMutation
                    )
                ) {
                    scheduleProcessAds();
                }
            }
        );

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true,

                /*
                 * Only href changes are interesting to us.
                 * We deliberately don't observe style/class changes.
                 */
                attributes: true,
                attributeFilter: ['href'],
            }
        );

        console.log(
            `${LOG_PREFIX} DOM observer started`
        );

        return observer;
    }

    // -------------------------------------------------------------------------
    // Debug
    // -------------------------------------------------------------------------

    function getHiddenAds() {
        /*
         * Return a copy so console manipulations don't accidentally
         * mutate the in-memory state.
         */
        return JSON.parse(
            JSON.stringify(hiddenAds)
        );
    }

    function getState() {
        const ads = findAds();

        return {
            adsLoaded: ads.length,

            hiddenInCurrentResults:
                ads.filter(
                    ad => isAdHidden(ad.adId)
                ).length,

            hiddenTotal:
                Object.keys(hiddenAds).length,

            showHiddenAds,
        };
    }

    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------

    function init() {
        processAds();

        const observer = startObserver();

        unsafeWindow.lbcHideDebug = {
            processAds,
            findAds,
            getAdIdFromUrl,

            getHiddenAds,
            getState,

            restoreAd,
            restoreAll,

            observer,
        };
    }

    init();

})();