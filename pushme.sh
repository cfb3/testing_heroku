MSG="$*"
if [ -z "$MSG" ] 
then
	MSG="no comit message"
fi
echo $MSG
git add .
git commit -m '$MSG'
git push heroku master
