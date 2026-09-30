#!/usr/bin/env node
// Project list and classification checks run only in a disposable profile.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const output = fs.mkdtempSync(path.join(root, 'dist', 'workspace-tools-ui-'));
  const profile = path.join(output, 'profile'), managed = path.join(profile, 'projects');
  fs.mkdirSync(managed, { recursive: true });
  const ids = [1, 2, 3].map(n => `project_${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`);
  const groups = ['project_group_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'project_group_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
  const directories = ['long', 'short', 'empty'].map(name => path.join(managed, name));
  directories.forEach((directory, i) => {
    fs.mkdirSync(path.join(directory, '.gitfinder'), { recursive: true });
    fs.writeFileSync(path.join(directory, '.gitfinder', 'project.json'), JSON.stringify({ schemaVersion: 1, projectId: ids[i], name: ['长简介与多个仓库的项目', '短简介项目', '空简介项目'][i], description: ['这是一段很长的简介，用于验证描述不会把同一行卡片和按钮撑到不同高度。'.repeat(30), '简单说明', ''][i], color: 'blue', lifecycle: 'active', repositories: { excluded: [] } }));
  });
  for (const name of ['one', 'two', 'three']) {
    const directory = path.join(directories[0], name); fs.mkdirSync(directory);
    execFileSync('git', ['init', '--quiet', directory]);
  }
  fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({ treeRoots: [{ path: managed, name: '隔离项目', expanded: true }], lastPath: managed, defaultScanPath: managed, autoRefresh: false, automaticUpdateChecks: false, detailPanelHidden: true, projectCardSize: 'medium', themeMode: 'light', projectGroups: { version: 1, groups: [{ groupId: groups[0], name: '管理类', color: 'blue', projectIds: [ids[0], ids[1]] }, { groupId: groups[1], name: '工具类', color: 'purple', projectIds: [ids[2]] }] } }));

  fs.writeFileSync(path.join(directories[0], 'cover.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAYS0lEQVR4nA3PAWc6DQDA4ffj/BljjDHGGGOMETEixmk5LadyWk7ltJzKaTktp+VUTuW0nMqpnErsJ8YYMcYY+x7vnm/w/PdPYE9gX+BA4FDgSOBY4ETgVOBM4FzgQuBS4EogIBAUuBYICYQFbgQEgVsBUeBOQBJICsgC9wKKQE5AFXgQ0ATKArrAo4Ah8CRgCjwLWAIdAVugL+AIvAi4AhMBT2Au4AusBDYCrwJbgTeBd4EPgZ3Ap8CXwLfAj8CvwH//IuxF2I9wEOEwwlGE4wgnEU4jnEU4j3AR4TLCVYRAhGCE6wihCOEINxGECLcRxAh3EaQIyQhyhPsISoRcBDXCQwQtQjmCHuExghHhKYIZ4TmCFaETwY7Qj+BEeIngRphE8CLMI/gRVhE2EV4jbCO8RXiP8BFhF+EzwleE7wg/EX4jf4Eoe1H2oxxEOYxyFOU4ykmU0yhnUc6jXES5jHIVJRAlGOU6SihKOMpNFCHKbRQxyl0UKUoyihzlPooSJRdFjfIQRYtSjqJHeYxiRHmKYkZ5jmJF6USxo/SjOFFeorhRJlG8KPMofpRVlE2U1yjbKG9R3qN8RNlF+YzyFeU7yk+U3+hfQGRPZF/kQORQ5EjkWORE5FTkTORc5ELkUuRKJCASFLkWCYmERW5EBJFbEVHkTkQSSYrIIvciikhORBV5ENFEyiK6yKOIIfIkYoo8i1giHRFbpC/iiLyIuCITEU9kLuKLrEQ2Iq8iW5E3kXeRD5GdyKfIl8i3yI/Ir/gXiLEXYz/GQYzDGEcxjmOcxDiNcRbjPMZFjMsYVzECMYIxrmOEYoRj3MQQYtzGEGPcxZBiJGPIMe5jKDFyMdQYDzG0GOUYeozHGEaMpxhmjOcYVoxODDtGP4YT4yWGG2MSw4sxj+HHWMXYxHiNsY3xFuM9xkeMXYzPGF8xvmP8xPiN/QXi7MXZj3MQ5zDOUZzjOCdxTuOcxTmPcxHnMs5VnECcYJzrOKE44Tg3cYQ4t3HEOHdxpDjJOHKc+zhKnFwcNc5DHC1OOY4e5zGOEecpjhnnOY4VpxPHjtOP48R5iePGmcTx4szj+HFWcTZxXuNs47zFeY/zEWcX5zPOV5zvOD9xfuN/AYk9iX2JA4lDiSOJY4kTiVOJM4lziQuJS4kriYBEUOJaIiQRlriRECRuJUSJOwlJIikhS9xLKBI5CVXiQUKTKEvoEo8ShsSThCnxLGFJdCRsib6EI/Ei4UpMJDyJuYQvsZLYSLxKbCXeJN4lPiR2Ep8SXxLfEj8Sv9JfIMFegv0EBwkOExwlOE5wkuA0wVmC8wQXCS4TXCUIJAgmuE4QShBOcJNASHCbQExwl0BKkEwgJ7hPoCTIJVATPCTQEpQT6AkeExgJnhKYCZ4TWAk6CewE/QROgpcEboJJAi/BPIGfYJVgk+A1wTbBW4L3BB8Jdgk+E3wl+E7wk+A38RdIsZdiP8VBisMURymOU5ykOE1xluI8xUWKyxRXKQIpgimuU4RShFPcpBBS3KYQU9ylkFIkU8gp7lMoKXIp1BQPKbQU5RR6iscURoqnFGaK5xRWik4KO0U/hZPiJYWbYpLCSzFP4adYpdikeE2xTfGW4j3FR4pdis8UXym+U/yk+E39BWT2ZPZlDmQOZY5kjmVOZE5lzmTOZS5kLmWuZAIyQZlrmZBMWOZGRpC5lRFl7mQkmaSMLHMvo8jkZFSZBxlNpiyjyzzKGDJPMqbMs4wl05GxZfoyjsyLjCszkfFk5jK+zEpmI/Mqs5V5k3mX+ZDZyXzKfMl8y/zI/Mp/gTR7afbTHKQ5THOU5jjNSZrTNGdpztNcpLlMc5UmkCaY5jpNKE04zU0aIc1tGjHNXRopTTKNnOY+jZIml0ZN85BGS1NOo6d5TGOkeUpjpnlOY6XppLHT9NM4aV7SuGkmabw08zR+mlWaTZrXNNs0b2ne03yk2aX5TPOV5jvNT5rf9F8gw16G/QwHGQ4zHGU4znCS4TTDWYbzDBcZLjNcZQhkCGa4zhDKEM5wk0HIcJtBzHCXQcqQzCBnuM+gZMhlUDM8ZNAylDPoGR4zGBmeMpgZnjNYGToZ7Az9DE6GlwxuhkkGL8M8g59hlWGT4TXDNsNbhvcMHxl2GT4zfGX4zvCT4TfzF1DYU9hXOFA4VDhSOFY4UThVOFM4V7hQuFS4UggoBBWuFUIKYYUbBUHhVkFUuFOQFJIKssK9gqKQU1AVHhQ0hbKCrvCoYCg8KZgKzwqWQkfBVugrOAovCq7CRMFTmCv4CiuFjcKrwlbhTeFd4UNhp/Cp8KXwrfCj8Kv8BbLsZdnPcpDlMMtRluMsJ1lOs5xlOc9ykeUyy1WWQJZglussoSzhLDdZhCy3WcQsd1mkLMkscpb7LEqWXBY1y0MWLUs5i57lMYuR5SmLmeU5i5Wlk8XO0s/iZHnJ4maZZPGyzLP4WVZZNlles2yzvGV5z/KRZZflM8tXlu8sP1l+s3+BPHt59vMc5DnMc5TnOM9JntM8Z3nO81zkucxzlSeQJ5jnOk8oTzjPTR4hz20eMc9dHilPMo+c5z6PkieXR83zkEfLU86j53nMY+R5ymPmec5j5enksfP08zh5XvK4eSZ5vDzzPH6eVZ5Nntc82zxved7zfOTZ5fnM85XnO89Pnt/8X0BlT2Vf5UDlUOVI5VjlROVU5UzlXOVC5VLlSiWgElS5VgmphFVuVASVWxVR5U5FUkmqyCr3KopKTkVVeVDRVMoqusqjiqHypGKqPKtYKh0VW6Wv4qi8qLgqExVPZa7iq6xUNiqvKluVN5V3lQ+VncqnypfKt8qPyq/6FyiwV2C/wEGBwwJHBY4LnBQ4LXBW4LzARYHLAlcFAgWCBa4LhAqEC9wUEArcFhAL3BWQCiQLyAXuCygFcgXUAg8FtALlAnqBxwJGgacCZoHnAlaBTgG7QL+AU+ClgFtgUsArMC/gF1gV2BR4LbAt8FbgvcBHgV2BzwJfBb4L/BT4LfwFiuwV2S9yUOSwyFGR4yInRU6LnBU5L3JR5LLIVZFAkWCR6yKhIuEiN0WEIrdFxCJ3RaQiySJykfsiSpFcEbXIQxGtSLmIXuSxiFHkqYhZ5LmIVaRTxC7SL+IUeSniFpkU8YrMi/hFVkU2RV6LbIu8FXkv8lFkV+SzyFeR7yI/RX6LfwGNPY19jQONQ40jjWONE41TjTONc40LjUuNK42ARlDjWiOkEda40RA0bjVEjTsNSSOpIWvcaygaOQ1V40FD0yhr6BqPGobGk4ap8axhaXQ0bI2+hqPxouFqTDQ8jbmGr7HS2Gi8amw13jTeNT40dhqfGl8a3xo/Gr/aX6DEXon9EgclDksclTgucVLitMRZifMSFyUuS1yVCJQIlrguESoRLnFTQihxW0IscVdCKpEsIZe4L6GUyJVQSzyU0EqUS+glHksYJZ5KmCWeS1glOiXsEv0STomXEm6JSQmvxLyEX2JVYlPitcS2xFuJ9xIfJXYlPkt8lfgu8VPit/QXqLBXYb/CQYXDCkcVjiucVDitcFbhvMJFhcsKVxUCFYIVriuEKoQr3FQQKtxWECvcVZAqJCvIFe4rKBVyFdQKDxW0CuUKeoXHCkaFpwpmhecKVoVOBbtCv4JT4aWCW2FSwaswr+BXWFXYVHitsK3wVuG9wkeFXYXPCl8Vviv8VPit/AV09nT2dQ50DnWOdI51TnROdc50znUudC51rnQCOkGda52QTljnRkfQudURde50JJ2kjqxzr6Po5HRUnQcdTaeso+s86hg6TzqmzrOOpdPRsXX6Oo7Oi46rM9HxdOY6vs5KZ6PzqrPVedN51/nQ2el86nzpfOv86Pzqf4Eqe1X2qxxUOaxyVOW4ykmV0ypnVc6rXFS5rHJVJVAlWOW6SqhKuMpNFaHKbRWxyl0VqUqyilzlvopSJVdFrfJQRatSrqJXeaxiVHmqYlZ5rmJV6VSxq/SrOFVeqrhVJlW8KvMqfpVVlU2V1yrbKm9V3qt8VNlV+azyVeW7yk+V3+pfoMZejf0aBzUOaxzVOK5xUuO0xlmN8xoXNS5rXNUI1AjWuK4RqhGucVNDqHFbQ6xxV0Oqkawh17ivodTI1VBrPNTQapRr6DUeaxg1nmqYNZ5rWDU6Newa/RpOjZcabo1JDa/GvIZfY1VjU+O1xrbGW433Gh81djU+a3zV+K7xU+O39hcw2DPYNzgwODQ4Mjg2ODE4NTgzODe4MLg0uDIIGAQNrg1CBmGDGwPB4NZANLgzkAySBrLBvYFikDNQDR4MNIOygW7waGAYPBmYBs8GlkHHwDboGzgGLwauwcTAM5gb+AYrg43Bq8HW4M3g3eDDYGfwafBl8G3wY/Br/AXq7NXZr3NQ57DOUZ3jOid1Tuuc1Tmvc1Hnss5VnUCdYJ3rOqE64To3dYQ6t3XEOnd1pDrJOnKd+zpKnVwdtc5DHa1OuY5e57GOUeepjlnnuY5Vp1PHrtOv49R5qePWmdTx6szr+HVWdTZ1Xuts67zVea/zUWdX57POV53vOj91fut/gQZ7DfYbHDQ4bHDU4LjBSYPTBmcNzhtcNLhscNUg0CDY4LpBqEG4wU0DocFtA7HBXQOpQbKB3OC+gdIg10Bt8NBAa1BuoDd4bGA0eGpgNnhuYDXoNLAb9Bs4DV4auA0mDbwG8wZ+g1WDTYPXBtsGbw3eG3w02DX4bPDV4LvBT4Pfxl/AZM9k3+TA5NDkyOTY5MTk1OTM5NzkwuTS5MokYBI0uTYJmYRNbkwEk1sT0eTORDJJmsgm9yaKSc5ENXkw0UzKJrrJo4lh8mRimjybWCYdE9ukb+KYvJi4JhMTz2Ru4pusTDYmryZbkzeTd5MPk53Jp8mXybfJj8mv+Rdostdkv8lBk8MmR02Om5w0OW1y1uS8yUWTyyZXTQJNgk2um4SahJvcNBGa3DYRm9w1kZokm8hN7psoTXJN1CYPTbQm5SZ6k8cmRpOnJmaT5yZWk04Tu0m/idPkpYnbZNLEazJv4jdZNdk0eW2ybfLW5L3JR5Ndk88mX02+m/w0+W3+BVrstdhvcdDisMVRi+MWJy1OW5y1OG9x0eKyxVWLQItgi+sWoRbhFjcthBa3LcQWdy2kFskWcov7FkqLXAu1xUMLrUW5hd7isYXR4qmF2eK5hdWi08Ju0W/htHhp4baYtPBazFv4LVYtNi1eW2xbvLV4b/HRYtfis8VXi+8WPy1+W38Biz2LfYsDi0OLI4tjixOLU4szi3OLC4tLiyuLgEXQ4toiZBG2uLEQLG4tRIs7C8kiaSFb3FsoFjkL1eLBQrMoW+gWjxaGxZOFafFsYVl0LGyLvoVj8WLhWkwsPIu5hW+xsthYvFpsLd4s3i0+LHYWnxZfFt8WPxa/1l+gzV6b/TYHbQ7bHLU5bnPS5rTNWZvzNhdtLttctQm0Cba5bhNqE25z00Zoc9tGbHPXRmqTbCO3uW+jtMm1Uds8tNHalNvobR7bGG2e2phtnttYbTpt7Db9Nk6blzZum0kbr828jd9m1WbT5rXNts1bm/c2H212bT7bfLX5bvPT5rf9F+iy12W/y0GXwy5HXY67nHQ57XLW5bzLRZfLLlddAl2CXa67hLqEu9x0EbrcdhG73HWRuiS7yF3uuyhdcl3ULg9dtC7lLnqXxy5Gl6cuZpfnLlaXThe7S7+L0+Wli9tl0sXrMu/id1l12XR57bLt8tblvctHl12Xzy5fXb67/HT57f4FbPZs9m0ObA5tjmyObU5sTm3ObM5tLmwuba5sAjZBm2ubkE3Y5sZGsLm1EW3ubCSbpI1sc2+j2ORsVJsHG82mbKPbPNoYNk82ps2zjWXTsbFt+jaOzYuNazOx8WzmNr7NymZj82qztXmzebf5sNnZfNp82Xzb/Nj82n+BHns99nsc9DjscdTjuMdJj9MeZz3Oe1z0uOxx1SPQI9jjukeoR7jHTQ+hx20PscddD6lHsofc476H0iPXQ+3x0EPrUe6h93jsYfR46mH2eO5h9ej0sHv0ezg9Xnq4PSY9vB7zHn6PVY9Nj9ce2x5vPd57fPTY9fjs8dXju8dPj9/eX2DA3oD9AQcDDgccDTgecDLgdMDZgPMBFwMuB1wNCAwIDrgeEBoQHnAzQBhwO0AccDdAGpAcIA+4H6AMyA1QBzwM0AaUB+gDHgcYA54GmAOeB1gDOgPsAf0BzoCXAe6AyQBvwHyAP2A1YDPgdcB2wNuA9wEfA3YDPgd8Dfge8DPgd/AXcNhz2Hc4cDh0OHI4djhxOHU4czh3uHC4dLhyCDgEHa4dQg5hhxsHweHWQXS4c5Ackg6yw72D4pBzUB0eHDSHsoPu8OhgODw5mA7PDpZDx8F26Ds4Di8OrsPEwXOYO/gOK4eNw6vD1uHN4d3hw2Hn8Onw5fDt8OPw6/wFhuwN2R9yMORwyNGQ4yEnQ06HnA05H3Ix5HLI1ZDAkOCQ6yGhIeEhN0OEIbdDxCF3Q6QhySHykPshypDcEHXIwxBtSHmIPuRxiDHkaYg55HmINaQzxB7SH+IMeRniDpkM8YbMh/hDVkM2Q16HbIe8DXkf8jFkN+RzyNeQ7yE/Q36Hf4EReyP2RxyMOBxxNOJ4xMmI0xFnI85HXIy4HHE1IjAiOOJ6RGhEeMTNCGHE7QhxxN0IaURyhDzifoQyIjdCHfEwQhtRHqGPeBxhjHgaYY54HmGN6IywR/RHOCNeRrgjJiO8EfMR/ojViM2I1xHbEW8j3kd8jNiN+BzxNeJ7xM+I39FfwGXPZd/lwOXQ5cjl2OXE5dTlzOXc5cLl0uXKJeASdLl2CbmEXW5cBJdbF9HlzkVySbrILvcuikvORXV5cNFcyi66y6OL4fLkYro8u1guHRfbpe/iuLy4uC4TF89l7uK7rFw2Lq8uW5c3l3eXD5edy6fLl8u3y4/Lr/sXGLM3Zn/MwZjDMUdjjsecjDkdczbmfMzFmMsxV2MCY4JjrseExoTH3IwRxtyOEcfcjZHGJMfIY+7HKGNyY9QxD2O0MeUx+pjHMcaYpzHmmOcx1pjOGHtMf4wz5mWMO2YyxhszH+OPWY3ZjHkdsx3zNuZ9zMeY3ZjPMV9jvsf8jPkd/wWm7E3Zn3Iw5XDK0ZTjKSdTTqecTTmfcjHlcsrVlMCU4JTrKaEp4Sk3U4Qpt1PEKXdTpCnJKfKU+ynKlNwUdcrDFG1KeYo+5XGKMeVpijnleYo1pTPFntKf4kx5meJOmUzxpsyn+FNWUzZTXqdsp7xNeZ/yMWU35XPK15TvKT9Tfqd/AY89j32PA49DjyOPY48Tj1OPM49zjwuPS48rj4BH0OPaI+QR9rjxEDxuPUSPOw/JI+khe9x7KB45D9XjwUPzKHvoHo8ehseTh+nx7GF5dDxsj76H4/Hi4XpMPDyPuYfvsfLYeLx6bD3ePN49Pjx2Hp8eXx7fHj8ev95fYMbejP0ZBzMOZxzNOJ5xMuN0xtmM8xkXMy5nXM0IzAjOuJ4RmhGecTNDmHE7Q5xxN0OakZwhz7ifoczIzVBnPMzQZpRn6DMeZxgznmaYM55nWDM6M+wZ/RnOjJcZ7ozJDG/GfIY/YzVjM+N1xnbG24z3GR8zdjM+Z3zN+J7xM+N39hdYsLdgf8HBgsMFRwuOF5wsOF1wtuB8wcWCywVXCwILgguuF4QWhBfcLBAW3C4QF9wtkBYkF8gL7hcoC3IL1AUPC7QF5QX6gscFxoKnBeaC5wXWgs4Ce0F/gbPgZYG7YLLAWzBf4C9YLdgseF2wXfC24H3Bx4Ldgs8FXwu+F/ws+F38BXz2fPZ9DnwOfY58jn1OfE59znzOfS58Ln2ufAI+QZ9rn5BP2OfGR/C59RF97nwkn6SP7HPvo/jkfFSfBx/Np+yj+zz6GD5PPqbPs4/l0/Gxffo+js+Lj+sz8fF85j6+z8pn4/Pqs/V583n3+fDZ+Xz6fPl8+/z4/Pp/gSV7S/aXHCw5XHK05HjJyZLTJWdLzpdcLLlccrUksCS45HpJaEl4yc0SYcntEnHJ3RJpSXKJvOR+ibIkt0Rd8rBEW1Jeoi95XGIseVpiLnleYi3pLLGX9Jc4S16WuEsmS7wl8yX+ktWSzZLXJdslb0vel3ws2S35XPK15HvJz5Lf5V9gzd6a/TUHaw7XHK05XnOy5nTN2ZrzNRdrLtdcrQmsCa65XhNaE15zs0ZYc7tGXHO3RlqTXCOvuV+jrMmtUdc8rNHWlNfoax7XGGue1phrntdYazpr7DX9Nc6alzXumskab818jb9mtWaz5nXNds3bmvc1H2t2az7XfK35XvOz5nfN/2grk0umMWxsAAAAAElFTkSuQmCC', 'base64'));
  fs.writeFileSync(path.join(directories[0], 'note.txt'), 'Folder preview fixture');
  const repo = path.join(directories[0], 'one');
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: { react: '1', typescript: '1' } }));
  fs.writeFileSync(path.join(repo, 'README.md'), '# Fixture');
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', ['-C', repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Initial fixture']);
  execFileSync('git', ['-C', repo, 'branch', 'feature']);
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'https://example.invalid/original.git']);
  for (const purpose of ['临时文件', '制品与备份']) {
    const directory = path.join(managed, purpose, 'copy');
    fs.mkdirSync(path.join(directory, '.gitfinder'), { recursive: true });
    fs.copyFileSync(path.join(directories[0], '.gitfinder', 'project.json'), path.join(directory, '.gitfinder', 'project.json'));
    execFileSync('git', ['init', '--quiet', directory]);
  }

  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const appIndex = process.argv.indexOf('--app'), executable = appIndex >= 0 ? path.resolve(process.argv[appIndex + 1]) : require('electron');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const log = fs.openSync(path.join(output, 'electron.log'), 'a');
  const child = spawn(executable, [...(appIndex < 0 ? [root] : []), `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { cwd: root, env, stdio: ['ignore', log, log] });
  let socket; const pending = new Map(), results = []; let sequence = 0;
  console.log('Evidence:', output);
  try {
    let page;
    for (let i = 0; i < 150; i++) {
      try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(p => p.type === 'page' && p.url.endsWith('src/renderer/index.html')); if (page) break; } catch (_) {}
      if (child.exitCode !== null) throw Error('Fixture app exited'); await delay(100);
    }
    assert.ok(page, 'Renderer unavailable'); socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { socket.addEventListener('open', r, { once: true }); socket.addEventListener('error', j, { once: true }); });
    socket.addEventListener('message', e => { const reply = JSON.parse(e.data), request = pending.get(reply.id); if (!request) return; pending.delete(reply.id); clearTimeout(request.timer); reply.error ? request.reject(Error(JSON.stringify(reply.error))) : request.resolve(reply.result); });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timeout`)); }, 25000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (reply.exceptionDetails) throw Error(JSON.stringify(reply.exceptionDetails)); return reply.result.value; };
    const wait = async expression => { for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); } throw Error(`Condition timeout: ${expression}\n${JSON.stringify(await evaluate("({mode:AppState.currentMode,path:AppState.currentPath,html:document.querySelector('#content-area').innerHTML.slice(0,3000), feedback:document.querySelector('#workspace-tools-feedback').textContent})"))}`); };
    const check = async (name, expression) => { assert.equal(await evaluate(expression), true, name); results.push(name); console.log('PASS', name); };
    const click = async (selector, button = 'left') => { const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Control missing');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`); await send('Input.dispatchMouseEvent', { type: 'mousePressed', button, clickCount: 1, ...point }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button, clickCount: 1, ...point }); };
    const shot = async name => { await delay(300); const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, name), Buffer.from(r.data, 'base64')); };

    await wait("typeof App!=='undefined'&&App.workspaceToolsController&&AppState.localProjects.length===3");
    const tools = 'App.workspaceToolsController';
    const fill = (selector, value) => evaluate(`document.querySelector(${JSON.stringify(selector)}).value=${JSON.stringify(value)}`);
    const finished = async text => wait(`!${tools}.busy&&document.querySelector('#workspace-tools-feedback').textContent.includes(${JSON.stringify(text)})`);
    await evaluate("App.applyContentPreset('all-projects')");
    await wait("!AppState.localProjectsLoading&&document.querySelectorAll('.local-project-card').length===3");
    await check('临时打包及备份副本不进入项目列表', 'AppState.localProjects.length===3');
    await check('访达操作在项目卡片和右键菜单可发现', "document.querySelectorAll('[data-app-action=reveal-local-project]').length===3&&!!document.querySelector('[data-context-action=reveal]')");
    for (const width of [1560, 900, 620]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 980, deviceScaleFactor: 1, mobile: false });
      await check(`${width}px项目头部紧凑且不溢出`, `(()=>{const e=document.querySelector('.local-project-view-toolbar');return e.getBoundingClientRect().height<=${width===620?76:40}&&e.scrollWidth<=e.clientWidth;})()`);
      if (width===1560) await shot('compact-header.png');
    }
    await send('Emulation.clearDeviceMetricsOverride');
    await evaluate(`App.applyProjectType(${JSON.stringify(groups[1])})`);await wait("!AppState.localProjectsLoading&&document.querySelectorAll('.local-project-card').length===1");
    await check('项目类型筛选同时作用于左侧项目目录和右侧卡片', `(()=>{const h=document.querySelector('#project-shortcuts-list').innerHTML.split('项目目录')[1];return h.includes(${JSON.stringify(directories[2])})&&!h.includes(${JSON.stringify(directories[0])})&&!h.includes(${JSON.stringify(directories[1])});})()`);
    await evaluate("App.applyContentPreset('all-projects');AppState.searchQuery='短简介';AppState.searchScope='current'");await evaluate('App.renderProjectsView(false)');
    await check('项目名称搜索左右一致', "document.querySelectorAll('.local-project-card').length===1&&document.querySelector('#project-shortcuts-list').innerHTML.split('项目目录')[1].includes('短简介项目')&&!document.querySelector('#project-shortcuts-list').innerHTML.split('项目目录')[1].includes('长简介')");
    await evaluate("AppState.searchQuery='';App.applyContentPreset('all-projects')");
    await click('#sidebar-navigation-directories');
    await click('#sidebar-tree .tree-node.is-root .tree-node-edit');
    await wait("document.querySelector('#location-name-modal').style.display==='flex'");
    await fill('#location-name-input','我的项目位置');await click('#location-name-save');
    await wait("document.querySelector('#location-name-modal').style.display==='none'");
    await check('位置别名保存且磁盘路径不变', `(async()=>{const r=(await gitFinder.config.getTreeRoots())[0];return r.name==='我的项目位置'&&r.path===${JSON.stringify(managed)}})()`);
    await click('#sidebar-tree .tree-node.is-root .tree-node-edit');await wait("document.querySelector('#location-name-modal').style.display==='flex'");await fill('#location-name-input','取消的名称');await click('#location-name-modal [data-location-close]');
    await check('取消别名编辑不写入', "(async()=>(await gitFinder.config.getTreeRoots())[0].name==='我的项目位置')()");
    await click('#sidebar-tree .tree-node.is-root .tree-node-edit');await wait("document.querySelector('#location-name-modal').style.display==='flex'");await click('#location-name-reset');await click('#location-name-save');await wait("document.querySelector('#location-name-modal').style.display==='none'");
    await check('恢复默认名称可保存', "(async()=>(await gitFinder.config.getTreeRoots())[0].name==='projects')()");
    await evaluate(`(async()=>{await App.navigateTo(${JSON.stringify(directories[0])});})()`);await wait(`!!document.querySelector('#content-area [data-path="${repo}"]')`);
    await click(`#content-area [data-path="${repo}"]`, 'right');await wait("!document.querySelector('#file-context-menu').hidden");await click('[data-context-action=repository-tools]');
    await wait("document.querySelector('#workspace-tools-body').textContent.includes('feature')");
    await check('右键仓库入口可读取分支', "document.querySelector('#workspace-tools-title').textContent==='仓库工具'&&document.querySelector('#workspace-tools-body').textContent.includes('当前分支')");
    await evaluate('window.confirm=()=>false');await click('[data-workspace-tool=checkout][data-name=feature]');
    await check('取消切换不改变分支', `(async()=>(await gitFinder.git.getBranches(${JSON.stringify(repo)})).some(b=>b.isCurrent&&b.name!=='feature'))()`);
    await evaluate('window.confirm=()=>true');await click('[data-workspace-tool=checkout][data-name=feature]');await finished('已切换');
    assert.equal(execFileSync('git',['-C',repo,'branch','--show-current'],{encoding:'utf8'}).trim(),'feature');results.push('本地分支切换实际生效');
    await click('[data-workspace-tool=tab][data-tab=remotes]');await wait("!!document.querySelector('#remote-edit-form')");
    await fill('#remote-name','backup');await fill('#remote-url','https://example.invalid/backup.git');await click('#remote-save');await finished('已添加');
    await check('远程添加生效', `(async()=>(await gitFinder.git.getRemotes(${JSON.stringify(repo)})).some(r=>r.name==='backup'))()`);
    await click('[data-workspace-tool=edit-remote][data-name=backup]');await fill('#remote-url','https://example.invalid/edited.git');await click('#remote-save');await finished('已保存');
    await check('远程地址编辑生效', `(async()=>(await gitFinder.git.getRemotes(${JSON.stringify(repo)})).some(r=>r.name==='backup'&&r.fetchUrl.endsWith('/edited.git')) )()`);
    await fill('#remote-name','origin');await fill('#remote-url','https://example.invalid/conflict.git');await click('#remote-save');await wait(`!${tools}.busy&&document.querySelector('#workspace-tools-feedback').classList.contains('error')`);
    await check('Git失败显示错误，原有远程配置保留', `(async()=>(await gitFinder.git.getRemotes(${JSON.stringify(repo)})).some(r=>r.name==='origin'&&r.fetchUrl.endsWith('/original.git')))()`);
    await evaluate('window.confirm=()=>false');await click('[data-workspace-tool=remove-remote][data-name=backup]');await check('取消移除远程不写入', `(async()=>(await gitFinder.git.getRemotes(${JSON.stringify(repo)})).some(r=>r.name==='backup'))()`);
    await evaluate('window.confirm=()=>true');await click('[data-workspace-tool=remove-remote][data-name=backup]');await finished('已移除');
    await check('移除远程配置实际生效', `(async()=>!(await gitFinder.git.getRemotes(${JSON.stringify(repo)})).some(r=>r.name==='backup'))()`);
    await click('[data-workspace-tool=tab][data-tab=history]');await wait("document.querySelector('#workspace-tools-body').textContent.includes('Initial fixture')");results.push('提交历史显示真实提交');
    await click('[data-workspace-tool=tab][data-tab=tags]');await wait("!!document.querySelector('[data-detected-tag=React]')");await click('[data-detected-tag=React]');await click('[data-workspace-tool=apply-tags]');await finished('已加入');
    await check('技术标签识别且勾选加入', `(async()=>(await gitFinder.tags.getRepoTags(${JSON.stringify(repo)})).some(t=>t.name==='React'))()`);await shot('repository-tools.png');
    await click('[data-workspace-tool=close]');
    await evaluate("(async()=>{const s=await App.scanManagedRepositories();await gitFinder.repos.set(s.repos);await App.loadPersistedRepos();App.applyContentPreset('all-repositories');})()");await wait("AppState.allRepos.length===3&&!AppState.repoScanning");
    await evaluate("AppState.searchQuery='one';AppState.searchScope='current';AppState.filterEnabled.name=true;AppState.filterEnabled.readme=false;App.renderGridView(false)");await wait("AppState.visibleItems.length===1");
    await check('Git仓库名称筛选左右一致且排除临时副本', `AppState.visibleItems[0].path===${JSON.stringify(repo)}&&document.querySelectorAll('#repository-shortcuts-list [data-repository-shortcut-path]').length===1&&document.querySelector('#repository-shortcuts-list [data-repository-shortcut-path]').dataset.repositoryShortcutPath===${JSON.stringify(repo)}`);
    await evaluate("AppState.searchQuery='';App.renderGridView(false)");
    const archivedRepo=path.join(directories[0],'two'), purgeRepo=path.join(directories[0],'three');
    await evaluate(`(async()=>{await gitFinder.repos.remove(${JSON.stringify(archivedRepo)});await gitFinder.repos.remove(${JSON.stringify(purgeRepo)});await App.openSettingsPage('settings-maintenance');})()`);
    await click('[data-app-action=open-repository-maintenance]');await wait("document.querySelector('#workspace-tools-body').textContent.includes('two')");
    await check('仓库维护入口列出归档记录', "document.querySelector('#workspace-tools-title').textContent==='仓库维护'&&document.querySelectorAll('[data-workspace-tool=restore]').length===2");
    await click(`[data-workspace-tool=restore][data-path="${archivedRepo}"]`);await finished('已恢复');
    await check('恢复登记回到活跃仓库且标签保留', `(async()=>(await gitFinder.repos.listActive()).some(r=>r.path===${JSON.stringify(archivedRepo)})&&(await gitFinder.tags.getRepoTags(${JSON.stringify(repo)})).some(t=>t.name==='React'))()`);
    await evaluate('window.confirm=()=>false');await click('[data-workspace-tool=purge]');await check('取消清除归档记录不写入', '(async()=>(await gitFinder.repos.listArchived()).length===1)()');
    await evaluate('window.confirm=()=>true');await click('[data-workspace-tool=purge]');await finished('已清除');
    await check('清除登记不删除磁盘目录', '(async()=>(await gitFinder.repos.listArchived()).length===0)()');assert.ok(fs.existsSync(path.join(purgeRepo,'.git')));
    await evaluate("(()=>{const e=document.querySelector('#registry-filter');e.value='active';e.dispatchEvent(new Event('change',{bubbles:true}));})()");await wait("!!document.querySelector('[data-workspace-tool=repair-id]')");
    await click(`[data-workspace-tool=repair-id][data-path="${repo}"]`);await finished('重新计算');await check('重算仓库标识保留标签关联', `(async()=>(await gitFinder.tags.getRepoTags(${JSON.stringify(repo)})).some(t=>t.name==='React'))()`);
    await click('[data-workspace-tool=tab][data-tab=groups]');await wait("!!document.querySelector('#directory-group-root')");await click('[data-workspace-tool=preview-groups]');await wait("!!document.querySelector('[data-workspace-tool=apply-groups]')");await click('[data-workspace-tool=apply-groups]');await finished('已生成');
    await check('目录仓库分组生成且项目类型不变', `(async()=>{return (await gitFinder.groups.get()).groups.some(g=>g.name==='long')&&(await gitFinder.projectGroups.list()).groups[0].projectIds.length===2;})()`);await shot('repository-maintenance.png');
    await click('[data-workspace-tool=close]');
    await evaluate(`(async()=>{AppState.currentMode='tree';AppState.searchQuery='';AppState.showHiddenFiles=false;AppState.cardStyle='card';await App.navigateTo(${JSON.stringify(managed)});})()`);
    await wait(`document.querySelector('[data-path="${directories[0]}"] [data-directory-preview]')?.dataset.previewState==='ready'`);
    await check('目录卡片未进入文件夹即可显示真实缩略图和本层数量', `document.querySelector('[data-path="${directories[0]}"] [data-directory-preview]').textContent.includes('2 个文件 · 3 个文件夹')&&document.querySelector('[data-path="${directories[0]}"] .directory-preview-images img')?.naturalWidth>0`);
    await shot('directory-previews.png');
    await evaluate("AppState.cardStyle='gallery';App.renderContent()");
    await wait(`document.querySelector('.finder-gallery-item[data-path="${directories[0]}"] [data-directory-preview]')?.dataset.previewState==='ready'`);
    await click(`.finder-gallery-item[data-path="${directories[0]}"]`);
    await wait("document.querySelector('#finder-gallery-preview-body .directory-preview-images img')?.naturalWidth>0");
    await check('图库目录概览包含本层数量、缩略图和文件样本', "document.querySelector('#finder-gallery-preview-body').textContent.includes('note.txt')&&document.querySelector('#finder-gallery-preview-body').textContent.includes('本层内容')");
    await shot('directory-gallery.png');
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({executable,passed:results.length,checks:results},null,2));console.log('PASSED',results.length);
  } finally {
    for (const request of pending.values()) clearTimeout(request.timer);
    if (socket) socket.close();
    if (child.exitCode === null) { child.kill('SIGTERM'); for (let i = 0; i < 60 && child.exitCode === null; i++) await delay(100); if (child.exitCode === null) child.kill('SIGKILL'); }
    fs.closeSync(log);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
