---
title: How to Download All Photos From an Instagram Carousel at Once (Not Just One)
description: A guide to downloading Instagram carousel/slide posts that contain multiple photos or videos at once, including why some tools can only grab a single photo.
date: 2026-08-16
---

Carousel posts on Instagram — marked with a small grid icon in the top-right corner of the photo — can hold up to 10 photos or videos in a single upload. The problem is, most people only need one or two photos from that carousel, but end up having to scroll through manually in the Instagram app and take screenshots, which come out looking bad due to recompression and the UI watermark.

## Why some downloaders only grab 1 photo

Instagram doesn't always expose the full carousel content in its public page HTML. For requests without login, Instagram often only shows the cover photo (the first one) through the `og:image` meta tag, while the rest of the carousel's photos only show up through internal data that needs a deeper extraction process. That's the technical reason why so many free downloader sites out there only manage to show one photo — they stop at the most basic meta tag and never go on to the actual carousel data.

## How to make sure every carousel photo gets pulled

1. **Copy the full post link.** Open the carousel post on Instagram, tap the three-dot icon, then choose "Copy Link". Make sure the link points to `/p/post-code/`, not a profile link.
2. **Paste the link into ToolkitMe's Instagram Downloader page.** The system automatically detects that the link is likely a carousel and prioritizes the extraction method that reads every slide, not just the cover photo.
3. **Wait for the results to appear as multiple cards.** Each photo or video in the carousel shows up as a separate card with its own download button, labeled "Photo 1", "Photo 2", and so on in their original order in the carousel.
4. **Download them one by one as needed.** You don't have to download everything if you only need a few — just click the download button on the photo cards you want.

## If the carousel mixes photos and videos

Some Instagram carousels combine photos and videos in the same post (for example, a product photo followed by a demo video in the next slide). Each item is still processed according to its original type — video is downloaded as a video file at its original quality, and photos as full-resolution image files, without being flattened into one format.

## Why it can still fail sometimes

There are a few situations no downloader tool can control:

- **Private account.** If the post owner's account is private, only logged-in followers can see the content at all — this is Instagram's privacy policy, not a limitation of the tool.
- **The post has been deleted.** A link that's no longer active can't be processed.
- **Temporary restrictions from Instagram.** Instagram sometimes temporarily limits anonymous access from certain servers. When this happens, it usually just needs to be retried a few minutes later.

As long as the post is public and still active, the entire carousel — not just the first photo — should be retrievable and downloadable one by one at its original quality.
