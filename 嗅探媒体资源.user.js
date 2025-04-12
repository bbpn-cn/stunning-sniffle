// ==UserScript==
// @name         检测页面中的媒体文件
// @namespace    http://tampermonkey.net/
// @version      1.19
// @description  检测页面中的媒体文件（视频/音频/图片/m3u8），显示资源数量按钮，点击查看链接列表，图片带有内嵌预览，支持全局隐藏/显示预览。按视频>疑似媒体>音频>图片排序，优化手机端和电脑端 UI，增强 iframe 中视频检测、抗广告干扰和脚本稳定性，类型显示为中文。
// @author       egg
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    // 检测是否为移动设备（增强检测逻辑）
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
        window.innerWidth <= 768;

    // 样式配置（分开移动端和电脑端）
    const styles = {
        button: {
            position: "fixed",
            bottom: isMobile ? "50px" : "20px",
            right: isMobile ? "10px" : "20px",
            zIndex: "2147483647",
            padding: isMobile ? "8px 14px" : "10px 16px",
            background: "linear-gradient(45deg, #007bff, #00c4ff)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: isMobile ? "12px" : "16px",
            boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
            transition: "transform 0.2s, box-shadow 0.2s",
        },
        popup: {
            display: "none",
            position: "fixed",
            bottom: isMobile ? "90px" : "70px", // 手机端缩小间距到 40px，电脑端缩小到 50px
            right: isMobile ? "10px" : "20px",
            zIndex: "2147483647",
            backgroundColor: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: "10px",
            padding: isMobile ? "10px" : "15px",
            maxWidth: isMobile ? "80vw" : "600px",
            maxHeight: isMobile ? "30vh" : "500px",
            overflowY: "auto",
            boxShadow: "0 6px 12px rgba(0, 0, 0, 0.15)",
            fontSize: isMobile ? "10px" : "14px",
            transition: "opacity 0.3s ease-in-out",
        },
        header: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: isMobile ? "8px" : "15px",
        },
        title: {
            margin: "0",
            fontSize: isMobile ? "12px" : "16px",
            color: "#333",
        },
        toggleButton: {
            padding: isMobile ? "4px 8px" : "5px 10px",
            backgroundColor: "#dc3545",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: isMobile ? "9px" : "12px",
            transition: "background-color 0.2s",
        },
        list: {
            listStyle: "none",
            padding: "0",
            margin: "0",
        },
        listItem: {
            display: "flex",
            flexDirection: "column",
            marginBottom: isMobile ? "8px" : "15px",
            padding: isMobile ? "4px" : "8px",
            borderBottom: "1px solid #f0f0f0",
        },
        link: {
            wordBreak: "break-all",
            color: "#007bff",
            textDecoration: "none",
            fontSize: isMobile ? "10px" : "14px",
            marginBottom: "5px",
        },
        preview: {
            display: "block",
            maxWidth: isMobile ? "80px" : "150px",
            maxHeight: isMobile ? "80px" : "150px",
            objectFit: "contain",
            border: "1px solid #ddd",
            borderRadius: "5px",
            marginTop: "5px",
        },
    };

    // 创建浮动按钮
    function createSnifferButton() {
        const button = document.createElement("button");
        button.id = "media-sniffer-button";
        Object.assign(button.style, styles.button);
        button.innerText = "检测中...";

        // 鼠标悬停效果（电脑端）
        if (!isMobile) {
            button.addEventListener("mouseover", () => {
                button.style.transform = "scale(1.05)";
                button.style.boxShadow = "0 6px 12px rgba(0, 0, 0, 0.3)";
            });
            button.addEventListener("mouseout", () => {
                button.style.transform = "scale(1)";
                button.style.boxShadow = styles.button.boxShadow;
            });
        }

        return button;
    }

    // 创建弹窗
    function createMediaPopup() {
        const popup = document.createElement("div");
        popup.id = "media-sniffer-popup";
        Object.assign(popup.style, styles.popup);
        return popup;
    }

    // 确保按钮和弹窗存在
    function ensureUIElements() {
        let button = document.getElementById("media-sniffer-button");
        let popup = document.getElementById("media-sniffer-popup");

        if (!button) {
            button = createSnifferButton();
            document.body.appendChild(button);
            button.onclick = () => {
                popup.style.display = popup.style.display === "none" ? "block" : "none";
                popup.style.opacity = popup.style.display === "block" ? "1" : "0";
            };
            if (isMobile) {
                button.addEventListener("touchstart", (e) => {
                    e.preventDefault();
                    popup.style.display = popup.style.display === "none" ? "block" : "none";
                    popup.style.opacity = popup.style.display === "block" ? "1" : "0";
                });
            }
        }

        if (!popup) {
            popup = createMediaPopup();
            document.body.appendChild(popup);
        }

        return { button, popup };
    }

    // 从 URL 参数中提取视频链接
    function extractVideoFromUrlParams(url) {
        try {
            const urlObj = new URL(url);
            const params = new URLSearchParams(urlObj.search);
            const videoUrl = params.get("url") || params.get("video") || params.get("src");
            if (!videoUrl) return null;

            const videoDomains = ["play-cdn", "vip", "video", "cdn", "stream"];
            const isVideoDomain = videoDomains.some((domain) =>
                urlObj.hostname.includes(domain)
            );

            if (videoUrl.match(/\.(m3u8|mp4|webm|flv|ts)$/i) || isVideoDomain) {
                return videoUrl;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    // 查找页面中的媒体资源
    function findMediaResources() {
        const mediaList = [];
        const seenUrls = new Set();

        const videos = document.querySelectorAll("video source, video[src], source[src]");
        const audios = document.querySelectorAll("audio source, audio[src]");
        const images = document.querySelectorAll("img[src]");
        const iframes = document.querySelectorAll("iframe[src]");

        videos.forEach((video) => {
            const src = video.src || video.getAttribute("src");
            if (src && !seenUrls.has(src)) {
                seenUrls.add(src);
                mediaList.push({ type: "video", src });
            }
        });

        audios.forEach((audio) => {
            const src = audio.src || audio.getAttribute("src");
            if (src && !seenUrls.has(src)) {
                seenUrls.add(src);
                mediaList.push({ type: "audio", src });
            }
        });

        images.forEach((img) => {
            const src = img.src || img.getAttribute("src");
            if (src && !seenUrls.has(src) && !src.includes("data:image")) {
                seenUrls.add(src);
                mediaList.push({ type: "image", src });
            }
        });

        iframes.forEach((iframe) => {
            const src = iframe.src || iframe.getAttribute("src");
            if (src && !seenUrls.has(src)) {
                seenUrls.add(src);
                const videoUrl = extractVideoFromUrlParams(src);
                if (videoUrl) {
                    if (!seenUrls.has(videoUrl)) {
                        seenUrls.add(videoUrl);
                        mediaList.push({ type: "video", src: videoUrl });
                    }
                } else if (src.includes("youtube.com") || src.includes("youtu.be")) {
                    const videoIdMatch = src.match(
                        /(?:v=|\/embed\/|youtu.be\/)([a-zA-Z0-9_-]+)/
                    );
                    const videoId = videoIdMatch ? videoIdMatch[1] : null;
                    if (videoId) {
                        const youtubeLink = `https://www.youtube.com/watch?v=${videoId}`;
                        if (!seenUrls.has(youtubeLink)) {
                            seenUrls.add(youtubeLink);
                            mediaList.push({ type: "video", src: youtubeLink });
                        }
                    }
                } else {
                    mediaList.push({ type: "iframe", src });
                }
            }
        });

        const sources = document.querySelectorAll("source[src]");
        sources.forEach((source) => {
            const src = source.src || source.getAttribute("src");
            if (src && src.includes(".m3u8") && !seenUrls.has(src)) {
                seenUrls.add(src);
                mediaList.push({ type: "video", src });
            }
        });

        const scripts = document.querySelectorAll("script");
        scripts.forEach((script) => {
            const text = script.textContent || script.innerHTML;
            const videoRegex = /(https?:\/\/[^\s'"]+\.(m3u8|mp4|webm|flv|ts))/g;
            const matches = text.match(videoRegex);
            if (matches) {
                matches.forEach((src) => {
                    if (!seenUrls.has(src)) {
                        seenUrls.add(src);
                        mediaList.push({ type: "video", src });
                    }
                });
            }
        });

        const links = document.querySelectorAll("a[href]");
        links.forEach((link) => {
            const href = link.href;
            if (
                href &&
                href.match(/\.(m3u8|mp4|webm|flv|ts)$/i) &&
                !seenUrls.has(href)
            ) {
                seenUrls.add(href);
                mediaList.push({ type: "video", src: href });
            }
        });

        const typeWeights = {
            video: 4,
            iframe: 3,
            audio: 2,
            image: 1,
        };

        mediaList.sort((a, b) => typeWeights[b.type] - typeWeights[a.type]);

        return mediaList;
    }

    let showPreviews = true;

    const typeLabels = {
        video: "视频",
        audio: "音频",
        image: "图片",
        iframe: "疑似媒体",
    };

    function updateUserInterface() {
        const { button, popup } = ensureUIElements();
        const mediaList = findMediaResources();
        button.innerText = `媒体资源: ${mediaList.length}`;

        popup.innerHTML = "";

        const header = document.createElement("div");
        Object.assign(header.style, styles.header);

        const title = document.createElement("h3");
        Object.assign(title.style, styles.title);
        title.textContent = "媒体文件链接";
        header.appendChild(title);

        const toggleButton = document.createElement("button");
        Object.assign(toggleButton.style, styles.toggleButton);
        toggleButton.textContent = showPreviews ? "关闭预览" : "显示预览";
        if (!isMobile) {
            toggleButton.addEventListener("mouseover", () => {
                toggleButton.style.backgroundColor = "#c82333";
            });
            toggleButton.addEventListener("mouseout", () => {
                toggleButton.style.backgroundColor = "#dc3545";
            });
        }
        header.appendChild(toggleButton);

        popup.appendChild(header);

        toggleButton.onclick = () => {
            showPreviews = !showPreviews;
            toggleButton.textContent = showPreviews ? "关闭预览" : "显示预览";
            const previews = popup.querySelectorAll(".image-preview");
            previews.forEach((preview) => {
                preview.style.display = showPreviews ? "block" : "none";
            });
        };

        if (mediaList.length === 0) {
            const message = document.createElement("p");
            message.textContent = "未找到媒体文件";
            message.style.color = "#666";
            message.style.textAlign = "center";
            popup.appendChild(message);
        } else {
            const list = document.createElement("ul");
            Object.assign(list.style, styles.list);

            mediaList.forEach((item) => {
                const listItem = document.createElement("li");
                Object.assign(listItem.style, styles.listItem);

                const link = document.createElement("a");
                Object.assign(link.style, styles.link);
                link.href = item.src;
                link.textContent = `[${typeLabels[item.type]}] ${
                    item.src.length > 50 ? item.src.substring(0, 50) + "..." : item.src
                }`;
                link.target = "_blank";
                listItem.appendChild(link);

                if (item.type === "image") {
                    const imgPreview = document.createElement("img");
                    imgPreview.src = item.src;
                    imgPreview.className = "image-preview";
                    Object.assign(imgPreview.style, styles.preview);
                    imgPreview.style.display = showPreviews ? "block" : "none";
                    listItem.appendChild(imgPreview);
                }

                list.appendChild(listItem);
            });

            popup.appendChild(list);
        }
    }

    setTimeout(() => {
        ensureUIElements();
        updateUserInterface();
    }, 5000);

    const observer = new MutationObserver(() => {
        ensureUIElements();
        setTimeout(updateUserInterface, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("scroll", () => {
        const { button } = ensureUIElements();
        button.style.bottom = isMobile ? "50px" : "20px";
        button.style.right = isMobile ? "10px" : "20px";
    });

    setInterval(() => {
        ensureUIElements();
    }, 2000);
})();
