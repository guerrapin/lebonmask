# 🙈 LebonMask

A lightweight userscript for [Leboncoin](https://www.leboncoin.fr/) that lets you permanently hide listings you are not interested in.

Hidden listings stay hidden across page reloads, searches and browser sessions.

## Features

* Hide any listing directly from the search results
* Persist hidden listings locally using the userscript manager storage
* Automatically hide previously hidden listings when they appear again
* Works with dynamically loaded search results
* Displays the number of hidden listings in the current search
* Temporarily show hidden listings
* Restore individual listings
* Works in both list and map views
* No backend, account or external service required

## Installation

You need a userscript manager such as:

* [Tampermonkey](https://www.tampermonkey.net/)
* [Violentmonkey](https://violentmonkey.github.io/)

Then:

1. Create a new userscript.
2. Copy the contents of `lebonmask.user.js`.
3. Save it.
4. Open or reload Leboncoin.

## Usage

Each listing gets a **✕ Masquer** button.

Clicking it:

* hides the listing immediately;
* stores its Leboncoin listing ID locally;
* keeps it hidden if it appears again in another search.

When hidden listings are present in the current results, LebonMask adds a counter next to the result count:

```text
81 annonces · 4 masquées  Afficher
```

Click **Afficher** to temporarily reveal hidden listings.

A revealed hidden listing gets a **↩ Restaurer** button, allowing it to be permanently removed from the hidden list.

## Persistence

LebonMask uses the userscript manager storage API:

```javascript
GM_getValue()
GM_setValue()
```

For each hidden listing, it stores:

```javascript
{
    "3239941959": {
        "title": "Appartement, 2 pièces, 35 mètres carrés.",
        "url": "https://www.leboncoin.fr/ad/locations/3239941959",
        "hiddenAt": "2026-09-06T18:30:00.000Z"
    }
}
```

All data remains local to your browser/userscript manager.

No data is sent anywhere.

## Dynamic pages

Leboncoin dynamically updates search results without always reloading the page.

LebonMask uses a `MutationObserver` to detect newly added listings and process them automatically.

## Map view

LebonMask also works with listing cards opened from the map.

One known limitation is that Leboncoin's map price markers do not expose the corresponding listing ID directly in their DOM element.

As a result, a hidden listing's price marker may still remain visible on the map even though the listing itself is hidden.

## Debugging

A small debug API is exposed in the browser console:

```javascript
lbcHideDebug.getState()
```

Example:

```javascript
{
    adsLoaded: 35,
    hiddenInCurrentResults: 3,
    hiddenTotal: 17,
    showHiddenAds: false
}
```

View all stored hidden listings:

```javascript
lbcHideDebug.getHiddenAds()
```

Restore one listing manually:

```javascript
lbcHideDebug.restoreAd("3239941959")
```

Restore everything:

```javascript
lbcHideDebug.restoreAll()
```

## Compatibility

Developed against the current Leboncoin web interface.

Because Leboncoin may change its HTML structure over time, future site updates may require adjustments to the userscript.

The script deliberately relies on semantic attributes such as `data-qa-id`, `aria-label`, and listing URLs rather than generated CSS class names whenever possible.

## Privacy

LebonMask:

* does not make external network requests;
* does not collect analytics;
* does not require a Leboncoin account;
* does not send hidden listing information anywhere.

## License

MIT
