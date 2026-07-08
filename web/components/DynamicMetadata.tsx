import Head from 'next/head';

interface DynamicMetadataProps {
    title: string;
    description: string;
    image?: string;
    url?: string;
}

/**
 * DynamicMetadata component for injecting SEO tags into specific pages.
 * Useful for market detail pages where metadata depends on the specific market data.
 */
export default function DynamicMetadata({
    title,
    description,
    image = '/og-image.png',
    url = 'https://agegg.io'
}: DynamicMetadataProps) {
    const fullTitle = `${title} | AGEGG`;

    return (
        <Head>
            <title>{fullTitle}</title>
            <meta name="description" content={description} />

            {/* OpenGraph */}
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={image} />
            <meta property="og:url" content={url} />
            <meta property="og:type" content="website" />

            {/* Twitter */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={image} />
        </Head>
    );
}
