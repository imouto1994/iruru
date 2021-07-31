const puppeteer = require("puppeteer");
const fs = require("fs/promises");

const { hideHeadless } = require("./stealth");
const cookiesJSON = require("./cookies.json");

const VIEWPORT_WIDTH = 5000;
const VIEWPORT_HEIGHT = 3000;

function parseDataUrl(dataUrl) {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (matches.length !== 3) {
    throw new Error("Could not parse data URL.");
  }
  return { mime: matches[1], buffer: Buffer.from(matches[2], "base64") };
}

async function saveImage(page, image, index) {
  const canvasSelector = `.currentScreen canvas`;

  await page.setViewport({
    width: image.width,
    height: image.height,
    deviceScaleFactor: 1,
  });
  await page.waitForTimeout(1000);
  const canvasDataUrl = await page.evaluate((selector) => {
    const canvasElement = document.querySelector(selector);
    return canvasElement.toDataURL();
  }, canvasSelector);
  const { buffer } = parseDataUrl(canvasDataUrl);
  await fs.writeFile(
    `./dist/image_${String(index).padStart(2, "0")}.png`,
    buffer,
    "base64"
  );
}

(async () => {
  const browser = await puppeteer.launch({
    args: [
      "--disable-web-security",
      "--disable-features=IsolateOrigins",
      " --disable-site-isolation-trials",
    ],
  });
  const page = await browser.newPage();

  await hideHeadless(page);

  await page.setViewport({
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    deviceScaleFactor: 1,
  });

  await page.setCookie(
    ...cookiesJSON.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      secure: cookie.secure,
    }))
  );

  // Load reader
  await page.goto(
    "https://book.dmm.co.jp/library/?age_limit=all&expired=1&item_id=b915awnmg00955"
  );

  await page.evaluate(() => {
    localStorage.setItem(
      "/NFBR_Settings/NFBR.SettingData",
      `{"viewerTapRange":50,"viewerSpreadDouble":false}`
    );
  });

  await page.waitForSelector(".m-boxListBookProductBlock__item");
  await page.click(".m-boxListBookProductBlock__item");

  const loadedByFileId = {};
  page.on("response", (response) => {
    const url = response.url();
    if (url.endsWith("/0.jpeg")) {
      const regex = /.*\/item\/xhtml\/(.*)\/0\.jpeg/;
      const match = url.match(regex);
      if (match != null) {
        fileId = `item/xhtml/${match[1]}`;
        console.log("FILE LOADED", fileId);
        loadedByFileId[fileId] = true;
      }
    }
  });

  const images = [];
  await (function () {
    return new Promise((resolve) => {
      page.on("response", async (response) => {
        const url = response.url();
        if (url.endsWith("/configuration_pack.json")) {
          const res = await response.json();
          const { contents } = res.configuration;
          for (const image of contents) {
            const imageInfo =
              res[image.file].FileLinkInfo.PageLinkInfoList[0].Page;
            images.push({
              file: image.file,
              width: imageInfo.Size.Width,
              height: imageInfo.Size.Height,
            });
          }
          resolve();
        }
      });
    });
  })();

  const numImages = images.length;

  let index = 0;
  while (index < numImages) {
    const image = images[index];
    console.log("Check image", image);
    if (loadedByFileId[image.file]) {
      await saveImage(page, image, index);
      index++;
      await page.keyboard.press("ArrowLeft");
    }
    await page.waitForTimeout(500);
  }

  await browser.close();
})();
