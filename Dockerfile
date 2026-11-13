# ========================================================
# NetMap - Production Dockerfile (Nginx Alpine)
# Ringan (~25MB), hemat RAM, performa tinggi untuk aaPanel
# ========================================================
FROM nginx:alpine

LABEL maintainer="NetMap Development Team"
LABEL description="Interactive Network Infrastructure Mapper & Topology System"

# Bersihkan direktori default static Nginx
RUN rm -rf /usr/share/nginx/html/*

# Pasang konfigurasi Nginx kustom
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Salin file web aplikasi
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY assets/ /usr/share/nginx/html/assets/

# Port HTTP default kontainer
EXPOSE 80

# Healthcheck untuk monitoring status kontainer di aaPanel
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Jalankan Nginx di foreground
CMD ["nginx", "-g", "daemon off;"]

