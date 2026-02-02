/// <reference path="../typing/manga-provider.d.ts" />

class Provider {
    private api: string = "https://3asq.org"
    private userAgent: string = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    private async fetch(url: string, opts: RequestInit = {}): Promise<Response> {
        console.log(`[3asq] Fetching: ${url}`)
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
        console.log(`[3asq] Searching for: ${query}`)
        const url = `${this.api}/?s=${encodeURIComponent(query)}&post_type=wp-manga`
        const resp = await this.fetch(url)
        const html = await resp.text()
        const $ = LoadDoc(html)

        const results: SearchResult[] = []

        $(".c-tabs-item__content, .tab-content-wrap, .c-tabs-item, .row.c-tabs-item__content").each((i: number, el: any) => {
            const titleAnchor = el.find(".post-title h3 a, .post-title h4 a, .post-title a").first()
            if (titleAnchor.length() === 0) return

            const title = titleAnchor.text().trim()
            const href = titleAnchor.attr("href")
            if (!href) return

            const slugMatch = href.match(/\/manga\/([^/]+)\//)
            if (!slugMatch) return
            const slug = slugMatch[1]

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

        console.log(`[3asq] Search results: ${results.length}`)
        return results
    }

    // Returns the chapters based on the manga ID (slug).
    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        console.log(`[3asq] Finding chapters for manga: ${mangaId}`)
        const url = `${this.api}/manga/${mangaId}/`
        const resp = await this.fetch(url)
        const html = await resp.text()
        let $ = LoadDoc(html)

        let chapters: ChapterDetails[] = []
        
        // 1. Try SSR Chapters
        chapters = this.parseChapters($, mangaId)
        console.log(`[3asq] SSR Chapters found: ${chapters.length}`)

        // 2. If nothing found, try AJAX (Madara special)
        if (chapters.length === 0) {
            console.log(`[3asq] No SSR chapters found, trying AJAX fallback...`)
            const postIdMatch = html.match(/postid-(\d+)/) || html.match(/data-id="(\d+)"/)
            if (postIdMatch) {
                const postId = postIdMatch[1]
                console.log(`[3asq] Found Post ID: ${postId}`)
                const ajaxUrl = `${this.api}/wp-admin/admin-ajax.php`
                const ajaxResp = await this.fetch(ajaxUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: `action=manga_get_chapters&manga=${postId}`
                })
                const ajaxHtml = await ajaxResp.text()
                console.log(`[3asq] AJAX Response length: ${ajaxHtml.length}`)
                const $ajax = LoadDoc(ajaxHtml)
                chapters = this.parseChapters($ajax, mangaId)
                console.log(`[3asq] AJAX Chapters found: ${chapters.length}`)
            } else {
                console.log(`[3asq] COULD NOT FIND POST ID IN HTML`)
            }
        }

        // Seanime requirement: ascending order
        chapters.reverse()
        chapters.forEach((chapter, index) => {
            chapter.index = index
        })

        console.log(`[3asq] Total chapters returning: ${chapters.length}`)
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
                index: 0
            })
        })
        return chapters
    }

    // Returns the chapter pages based on the chapter ID (mangaSlug$chapterSlug).
    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        console.log(`[3asq] Finding pages for chapter: ${chapterId}`)
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

        console.log(`[3asq] Pages found: ${pages.length}`)
        return pages
    }

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }
}
