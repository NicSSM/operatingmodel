/** @type {import('next').NextConfig} */
const isPages = process.env.GITHUB_PAGES === 'true';
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] || '';

module.exports = {
  output: 'export',                 // <- creates ./out during `next build`
  trailingSlash: true,              // friendlier for GitHub Pages
  images: { unoptimized: true },    // no image optimizer on Pages
  basePath: isPages ? `/${repo}` : '',
  assetPrefix: isPages ? `/${repo}/` : '',
  eslint: { ignoreDuringBuilds: true },        // optional: avoid CI lint fails
  typescript: { ignoreBuildErrors: true },     // optional: avoid CI type fails
};
