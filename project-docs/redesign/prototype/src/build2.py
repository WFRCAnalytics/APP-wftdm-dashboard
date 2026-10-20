import sys,io
r=lambda f:io.open(f,encoding='utf-8').read()
scen,core,core2,pages=r('scen.js'),r('core.js'),r('core2.js'),r('pages.js')
import os
tt=r('tt.js')
core3=r('core3.js') if os.path.exists('core3.js') else ''
for f in sys.argv[1:]:
    h=r(f+'.html').replace('/*CORE*/',scen+chr(10)+core).replace('/*CORE2*/',tt+chr(10)+core2).replace('/*CORE3*/',core3).replace('/*PAGES*/',pages)
    io.open('pub-'+f+'.html','w',encoding='utf-8').write(h)
    io.open('out-'+f+'.html','w',encoding='utf-8').write('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">'+h)
