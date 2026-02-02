/// <reference path="../typing/manga-provider.d.ts" />

class Provider {
    private api: string = "https://3asq.org"
    private userAgent: string = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    private async fetch(url: string, opts: RequestInit = {}): Promise<Response> {
        return fetch(url, {
            ...opts,
            headers: {
                "User-Agent": this.userAgent,
                "Referer": this.api + "/",
                ...opts.headers,
            }
        })
    }

    // Search for manga based on a query. Returns a list of search results.
    async search({ query }: QueryOptions): Promise<SearchResult[]> {
        const url = `${this.api}/?s=${encodeURIComponent(query)}&post_type=wp-manga`
        const resp = await this.fetch(url)
        const html = await resp.text()
        const $ = LoadDoc(html)

        const results: SearchResult[] = []

        $(".c-tabs-item__content, .tab-content-wrap, .c-tabs-item, .row.c-tabs-item__content").each((i: number, el: any) => {
            // Find title - target the precise link to avoid duplicates
            const titleAnchor = el.find(".post-title h3 a, .post-title h4 a, .post-title a").first()
            if (titleAnchor.length() === 0) return

            const title = titleAnchor.text().trim()
            const href = titleAnchor.attr("href")
            if (!href) return

            const slugMatch = href.match(/\/manga\/([^/]+)\//)
            if (!slugMatch) return
            const slug = slugMatch[1]

            // Find image - handle lazy loading
            const imgEl = el.find("img")
            const image = imgEl.attr("data-src")?.trim() || 
                          imgEl.attr("data-lazy-src")?.trim() || 
                          imgEl.attr("src")?.trim()

            results.push({
                id: slug,
                title: title,
                image: image
            })
        })

        return results
    }

    // Returns the chapters based on the manga ID (slug).
    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        const url = `${this.api}/manga/${mangaId}/`
        const resp = await this.fetch(url)
        const html = await resp.text()
        let $ = LoadDoc(html)

        let chapters: ChapterDetails[] = []
        
        // 1. Try SSR Chapters
        chapters = this.parseChapters($, mangaId)

        // 2. If nothing found, try AJAX (Madara special)
        if (chapters.length === 0) {
            // Find the post ID which is required for the AJAX call
            // Usually found in <body class="... postid-12345 ..."> or as data-id
            const postIdMatch = html.match(/postid-(\d+)/) || html.match(/data-id="(\d+)"/)
            if (postIdMatch) {
                const postId = postIdMatch[1]
                const ajaxUrl = `${this.api}/wp-admin/admin-ajax.php`
                const ajaxResp = await this.fetch(ajaxUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: `action=manga_get_chapters&manga=${postId}`
                })
                const ajaxHtml = await ajaxResp.text()
                const $ajax = LoadDoc(ajaxHtml)
                chapters = this.parseChapters($ajax, mangaId)
            }
        }

        // Seanime requirement: ascending order (Chapter 1, 2, 3...)
        // Madara returns descending, so we reverse
        chapters.reverse()
        chapters.forEach((chapter, index) => {
            chapter.index = index
        })

        return chapters
    }

    private parseChapters($: any, mangaId: string): ChapterDetails[] {
        const chapters: ChapterDetails[] = []
        $(".wp-manga-chapter").each((i: number, el: any) => {
            const a = el.find("a").first()
            const href = a.attr("href")
            if (!href) return

            const slugMatch = href.match(/\/manga\/[^/]+\/([^/]+)\//)
            if (!slugMatch) return
            const chapterSlug = slugMatch[1]
            const title = a.text().trim()

            chapters.push({
                id: `${mangaId}$${chapterSlug}`,
                url: href,
                title: title,
                chapter: chapterSlug,
                index: 0 // Placeholder
            })
        })
        return chapters
    }

    // Returns the chapter pages based on the chapter ID (mangaSlug$chapterSlug).
    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        const [mangaId, chapterSlug] = chapterId.split("$")
        const url = `${this.api}/manga/${mangaId}/${chapterSlug}/`
        const resp = await this.fetch(url)
        const html = await resp.text()
        const $ = LoadDoc(html)

        const pages: ChapterPage[] = []

        $(".wp-manga-chapter-img").each((i: number, el: any) => {
            const src = el.attr("data-src")?.trim() || 
                        el.attr("data-lazy-src")?.trim() || 
                        el.attr("src")?.trim()
            if (src) {
                pages.push({
                    url: src,
                    index: i,
                    headers: {
                        "Referer": this.api + "/"
                    }
                })
            }
        })

        return pages
    }

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }
}
