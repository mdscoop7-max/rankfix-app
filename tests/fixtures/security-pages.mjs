// Representative pages for passive security regression tests (synthetic, no real secrets).
const realLookingAws = "AKIA" + "Q3EGRZ7LW5MNXK2P";
export const pages = [
  {
    name: "modern shop",
    url: "https://shop.example.nl/",
    html: `<a href="http://partner.example.org/">Partner</a>
      <link rel="canonical" href="http://shop.example.nl/">
      <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC12"></script>
      <script src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/cdn.min.js"></script>
      <form action="/login"><input type="email" name="email"><input type="password" name="p"></form>`,
    setCookies: ["sid=a1; Path=/; Secure; HttpOnly; SameSite=Lax", "consent=1; Path=/; Secure; Expires=Wed, 21 Oct 2026 07:28:00 GMT"],
  },
  {
    name: "documentation site",
    url: "https://docs.example.com/aws",
    html: `<p>Example access key: AKIAIOSFODNN7EXAMPLE</p>
      <pre><code>aws configure set aws_access_key_id ${realLookingAws}</code></pre>
      <p>Your file starts with -----BEGIN RSA PRIVATE KEY----- followed by the key.</p>
      <a href="http://old.example.com/">old docs</a>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js" integrity="sha384-abc" crossorigin="anonymous"></script>`,
    setCookies: [],
  },
  {
    name: "leaky site",
    url: "https://leaky.example.nl/",
    html: `<img src="http://cdn.leaky.example.nl/hero.jpg" alt="">
      <script>window.cfg = { awsKey: "${realLookingAws}" };</script>
      <form action="http://leaky.example.nl/contact"><textarea name="m"></textarea></form>`,
    setCookies: ["session=xyz; Path=/"],
  },
  {
    name: "plain links only",
    url: "https://info.example.nl/",
    html: `<a href="http://a.example.org">A</a> <a href="http://b.example.org">B</a>
      <link rel="alternate" hreflang="de" href="http://info.example.de/">
      <svg xmlns="http://www.w3.org/2000/svg"><a href="http://c.example.org">C</a></svg>`,
    setCookies: [],
  },
];
