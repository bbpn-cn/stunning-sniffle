// ==UserScript==
// @name         检测页面中的媒体文件
// @namespace    http://tampermonkey.net/
// @version      1.15
// @description  检测页面中的媒体文件（视频/音频/图片/m3u8），显示资源数量按钮，点击查看链接列表，图片带有内嵌预览，支持全局隐藏/显示预览。按视频>疑似媒体>音频>图片排序，优化手机端和电脑端体验，增强 iframe 中视频检测、抗广告干扰和脚本稳定性，类型显示为中文。
// @author       egg
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    // 是否为移动设备
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

    // 样式配置
    const styles = {
        button: {
            position: "fixed",
            bottom: isMobile ? "60px" : "20px",
            right: isMobile ? "10px" : "20px",
            zIndex: "2147483647",
            padding: isMobile ? "8px 12px" : "10px 16px",
            background: "linear-gradient(45deg, #007bff, #00c4ff)", // 渐变色
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: isMobile ? "12px" : "16px",
            boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
            transition: "transform 0.2s, box-shadow 0.2s", // 动画效果
        },
        popup: {
            display: "none",
            position: "fixed",
            bottom: isMobile ? "100px" : "60px",
            right: isMobile ? "10px" : "20px",
            zIndex: "2147483647",
            backgroundColor: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: "10px",
            padding: "15px",
            maxWidth: isMobile ? "90vw" : "500px",
            maxHeight: isMobile ? "50vh" : "400px",
            overflowY: "auto",
            boxShadow: "0 6px 12px rgba(0, 0, 0, 0.15)",
            fontSize: isMobile ? "12px" : "14px",
            transition: "opacity 0.3s ease-in-out", // 淡入淡出动画
        },
        header: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "15px",
        },
        title: {
            margin: "0",
            fontSize: isMobile ? "14px" : "16px",
            color: "#333",
        },
        toggleButton: {
            padding: isMobile ? "4px 8px" : "5px 10px",
            backgroundColor: "#dc3545",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: isMobile ? "10px" : "12px",
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
            marginBottom: "15px",
            padding: "8px",
            borderBottom: "1px solid #f0f0f0",
        },
        link: {
            wordBreak: "break-all",
            color: "#007bff",
            textDecoration: "none",
            fontSize: isMobile ? "12px" : "14px",
            marginBottom: "5px",
        },
        preview: {
            display: "block",
            maxWidth: isMobile ? "100px" : "150px",
            maxHeight: isMobile ? "100px" : "150px",
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

        // 鼠标悬停效果
        button.addEventListener("mouseover", () => {
            button.style.transform = "scale(1.05)";
            button.style.boxShadow = "0 6px 12px rgba(0, 0, 0, 0.3)";
        });
        button.addEventListener("mouseout", () => {
            button.style.transform = "scale(1)";
            button.style.boxShadow = styles.button.boxShadow;
        });

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

        // 查找视频、音频、图片和 iframe
        const videos = document.querySelectorAll("video source, video[src], source[src]");
        const audios = document.querySelectorAll("audio source, audio[src]");
        const images = document.querySelectorAll("img[src]");
        const iframes = document.querySelectorAll("iframe[src]");

        // 处理视频
        videos.forEach((video) => {
            const src = video.src || video.getAttribute("src");
            if (src && !seenUrls.has(src)) {
                seenUrls.add(src);
                mediaList.push({ type: "video", src });
            }
        });

        // 处理音频
        audios.forEach((audio) => {
            const src = audio.src || audio.getAttribute("src");
            if (src && !seenUrls.has(src)) {
                seenUrls.add(src);
                mediaList.push({ type: "audio", src });
            }
        });

        // 处理图片
        images.forEach((img) => {
            const src = img.src || img.getAttribute("src");
            if (src && !seenUrls.has(src) && !src.includes("data:image")) {
                seenUrls.add(src);
                mediaList.push({ type: "image", src });
            }
        });

        // 处理 iframe
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

        // 查找 <source> 标签中的 m3u8
        const sources = document.querySelectorAll("source[src]");
        sources.forEach((source) => {
            const src = source.src || source.getAttribute("src");
            if (src && src.includes(".m3u8") && !seenUrls.has(src)) {
                seenUrls.add(src);
                mediaList.push({ type: "video", src });
            }
        });

        // 查找 script 标签中的视频链接
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

        // 查找 a 标签中的视频链接
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

        // 按类型权重排序：视频 > 疑似媒体 > 音频 > 图片
        const typeWeights = {
            video: 4,
            iframe: 3, // 疑似媒体
            audio: 2,
            image: 1,
        };

        mediaList.sort((a, b) => typeWeights[b.type] - typeWeights[a.type]);

        return mediaList;
    }

    // 全局状态：是否显示图片预览
    let showPreviews = true;

    // 类型映射到中文
    const typeLabels = {
        video: "视频",
        audio: "音频",
        image: "图片",
        iframe: "疑似媒体",
    };

    // 更新 UI
    function updateUserInterface() {
        const { button, popup } = ensureUIElements();
        const mediaList = findMediaResources();
        button.innerText = `媒体资源: ${mediaList.length}`;

        // 清空弹窗内容
        popup.innerHTML = "";

        // 创建头部：标题 + 切换预览按钮
        const header = document.createElement("div");
        Object.assign(header.style, styles.header);

        const title = document.createElement("h3");
        Object.assign(title.style, styles.title);
        title.textContent = "媒体文件链接";
        header.appendChild(title);

        const toggleButton = document.createElement("button");
        Object.assign(toggleButton.style, styles.toggleButton);
        toggleButton.textContent = showPreviews ? "关闭预览" : "显示预览";
        toggleButton.addEventListener("mouseover", () => {
            toggleButton.style.backgroundColor = "#c82333";
        });
        toggleButton.addEventListener("mouseout", () => {
            toggleButton.style.backgroundColor = "#dc3545";
        });
        header.appendChild(toggleButton);

        popup.appendChild(header);

        // 切换预览显示
        toggleButton.onclick = () => {
            showPreviews = !showPreviews;
            toggleButton.textContent = showPreviews ? "关闭预览" : "显示预览";
            const previews = popup.querySelectorAll(".image-preview");
            previews.forEach((preview) => {
                preview.style.display = showPreviews ? "block" : "none";
            });
        };

        // 显示媒体资源列表
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

    // 初次加载
    setTimeout(() => {
        ensureUIElements();
        updateUserInterface();
    }, 5000);

    // 监听 DOM 变化
    const observer = new MutationObserver(() => {
        ensureUIElements();
        setTimeout(updateUserInterface, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 监听滚动事件，防止按钮被覆盖
    window.addEventListener("scroll", () => {
        const { button } = ensureUIElements();
        button.style.bottom = isMobile ? "60px" : "20px";
        button.style.right = isMobile ? "10px" : "20px";
    });

    // 定期检查，确保按钮和弹窗存在
    setInterval(() => {
        ensureUIElements();
    }, 2000);
})();
