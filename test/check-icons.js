import puppeteer from 'puppeteer';

const DEV_SERVER_URL = 'http://localhost:5176/test/combined.html';

async function checkIcons() {
    const browser = await puppeteer.launch({
        headless: false,
        devtools: true
    });

    const page = await browser.newPage();

    page.on('console', msg => {
        console.log(`  ${msg.type()}: ${msg.text()}`);
    });

    await page.goto(DEV_SERVER_URL, { waitUntil: 'networkidle2' });

    // Wait for card to load
    await page.waitForFunction(() => {
        return document.getElementById('whereaboutscard');
    }, { timeout: 10000 });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check icon rendering
    const iconCheck = await page.evaluate(() => {
        // Check both light DOM and shadow DOM
        const card = document.getElementById('whereaboutscard');
        const shadowRoot = card?.shadowRoot;

        const lightIcons = Array.from(document.querySelectorAll('ha-icon'));
        const shadowIcons = shadowRoot ? Array.from(shadowRoot.querySelectorAll('ha-icon')) : [];
        const allIcons = [...lightIcons, ...shadowIcons];

        return {
            cardExists: !!card,
            hasShadowRoot: !!shadowRoot,
            lightIconCount: lightIcons.length,
            shadowIconCount: shadowIcons.length,
            totalIconCount: allIcons.length,
            iconDetails: allIcons.slice(0, 10).map(icon => ({
                iconName: icon.getAttribute('icon'),
                innerHTML: icon.innerHTML.substring(0, 200),
                width: icon.offsetWidth,
                height: icon.offsetHeight,
                computedStyles: {
                    display: window.getComputedStyle(icon).display,
                    fontSize: window.getComputedStyle(icon).fontSize,
                    color: window.getComputedStyle(icon).color
                },
                childElement: icon.querySelector('*') ? {
                    tagName: icon.querySelector('*').tagName,
                    classList: icon.querySelector('*').className,
                    fontSize: window.getComputedStyle(icon.querySelector('*')).fontSize,
                    fontFamily: window.getComputedStyle(icon.querySelector('*')).fontFamily,
                    content: icon.querySelector('*').textContent
                } : null
            })),
            mdiStylesheet: !!document.querySelector('link[href*="materialdesignicons"]'),
            iconifyLoaded: typeof window.Iconify !== 'undefined',
            iconifyIconCount: document.querySelectorAll('iconify-icon').length + (shadowRoot ? shadowRoot.querySelectorAll('iconify-icon').length : 0)
        };
    });

    console.log('\n🎨 Icon check:\n', JSON.stringify(iconCheck, null, 2));

    // Take a screenshot
    await page.screenshot({ path: 'test/icon-screenshot.png', fullPage: true });
    console.log('\n📸 Screenshot saved to test/icon-screenshot.png');

    console.log('\n✅ Complete. Browser window left open for inspection.');
}

checkIcons().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
